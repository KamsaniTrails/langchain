"""
FastAPI server exposing the multi-agent graph, document ingestion, and settings.

Endpoints:
  POST   /chat                 Start a new multi-agent run for a query
  POST   /approve              Resume a paused (human-in-the-loop) run
  GET    /trace/{thread_id}    Fetch the full state for the trace viewer
  GET    /health               Health check
  GET    /documents            List all indexed documents & status
  POST   /documents/upload     Upload and ingest document files (.pdf, .txt, .md)
  DELETE /documents/{filename} Delete an uploaded document and update vectorstore
  POST   /documents/clear      Clear all documents and reset index
  POST   /documents/sample     Load sample profile & research knowledge
  GET    /settings/status      Check if Gemini API key and models are configured
  POST   /settings/key         Update Gemini API key and model dynamically
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import List

from dotenv import load_dotenv, set_key
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from langchain_core.messages import HumanMessage
from pydantic import BaseModel

from .graph import build_graph
from .vectorstore import (
    clear_all_documents,
    delete_document,
    get_indexed_documents,
    load_sample_knowledge,
    save_and_ingest_file,
)

load_dotenv()

app = FastAPI(title="Synapse AI — Autonomous Multi-Agent Intelligence")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_graph = build_graph()
ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class ChatRequest(BaseModel):
    query: str
    thread_id: str | None = None


class ApproveRequest(BaseModel):
    thread_id: str
    approved: bool


class SettingsRequest(BaseModel):
    api_key: str | None = None
    model: str | None = None


def _config(thread_id: str) -> dict:
    return {"configurable": {"thread_id": thread_id}}


def _serialize_state(thread_id: str) -> dict:
    snapshot = _graph.get_state(_config(thread_id))
    state = snapshot.values or {}
    return {
        "thread_id": thread_id,
        "plan": state.get("plan", []),
        "tool_calls": state.get("tool_calls", []),
        "final_answer": state.get("final_answer"),
        "needs_human_approval": state.get("needs_human_approval", False),
        "human_approved": state.get("human_approved"),
        "next_nodes": list(snapshot.next),
        "messages": [
            {"type": m.type, "content": m.content} for m in state.get("messages", [])
        ],
    }


@app.get("/health")
def health():
    has_key = bool(os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY"))
    return {"status": "ok", "has_api_key": has_key}


@app.on_event("startup")
def init_sample_if_empty():
    docs = get_indexed_documents()
    if not docs.get("documents") or not docs.get("has_index"):
        try:
            load_sample_knowledge()
        except Exception as e:
            print(f"Startup knowledge notice: {e}")


@app.get("/settings/status")
def get_settings():
    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    masked_key = f"{api_key[:6]}...{api_key[-4:]}" if api_key and len(api_key) > 10 else None
    return {
        "has_api_key": bool(api_key),
        "masked_key": masked_key,
        "model": os.getenv("GEMINI_MODEL", "gemini-3.8-flash"),
        "embedding_model": os.getenv("GEMINI_EMBEDDING_MODEL", "models/gemini-embedding-001"),
    }


@app.post("/settings/key")
def update_settings(req: SettingsRequest):
    if req.api_key:
        clean_key = req.api_key.strip()
        os.environ["GOOGLE_API_KEY"] = clean_key
        try:
            set_key(str(ENV_FILE), "GOOGLE_API_KEY", clean_key)
        except Exception:
            pass

    if req.model:
        os.environ["GEMINI_MODEL"] = req.model.strip()
        try:
            set_key(str(ENV_FILE), "GEMINI_MODEL", req.model.strip())
        except Exception:
            pass

    return get_settings()


@app.get("/documents")
def list_documents():
    return get_indexed_documents()


@app.post("/documents/upload")
async def upload_document(files: List[UploadFile] = File(...)):
    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="Gemini API key is required to embed documents. Please enter your API key in Settings first.",
        )

    results = []
    for file in files:
        if not file.filename:
            continue
        ext = Path(file.filename).suffix.lower()
        if ext not in [".pdf", ".txt", ".md"]:
            raise HTTPException(
                status_code=400,
                detail=f"File '{file.filename}' has unsupported extension '{ext}'. Only .pdf, .txt, .md are supported.",
            )

        content = await file.read()
        try:
            res = save_and_ingest_file(file.filename, content)
            results.append(res)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to process '{file.filename}': {e}")

    return {
        "status": "success",
        "processed": len(results),
        "details": results,
        "documents": get_indexed_documents(),
    }


@app.delete("/documents/{filename}")
def remove_document(filename: str):
    res = delete_document(filename)
    return {"status": "success", "result": res, "documents": get_indexed_documents()}


@app.post("/documents/clear")
def clear_documents():
    res = clear_all_documents()
    return {"status": "success", "result": res, "documents": get_indexed_documents()}


@app.post("/documents/sample")
def populate_sample():
    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="Gemini API key is required to embed the sample document. Please enter your API key in Settings first.",
        )
    try:
        res = load_sample_knowledge()
        return {"status": "success", "result": res, "documents": get_indexed_documents()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load sample knowledge: {e}")


@app.post("/chat")
def chat(req: ChatRequest):
    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="Google Gemini API Key is missing. Please click 'Settings' at the top right and enter your Gemini API key.",
        )

    thread_id = req.thread_id or str(uuid.uuid4())
    initial_state = {
        "messages": [HumanMessage(content=req.query)],
        "query": req.query,
        "plan": [],
        "current_task_index": 0,
        "retrieved_context": [],
        "tool_calls": [],
        "retry_counts": {},
        "needs_human_approval": False,
        "human_approved": None,
        "final_answer": None,
        "error": None,
    }

    try:
        _graph.invoke(initial_state, config=_config(thread_id))
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Agent workflow error: {exc}",
        )

    return _serialize_state(thread_id)


@app.post("/approve")
def approve(req: ApproveRequest):
    snapshot = _graph.get_state(_config(req.thread_id))
    if not snapshot.values:
        raise HTTPException(status_code=404, detail="Unknown thread_id")

    try:
        _graph.update_state(_config(req.thread_id), {"human_approved": req.approved})
        _graph.invoke(None, config=_config(req.thread_id))  # resume from the checkpoint
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Approval execution error: {exc}")

    return _serialize_state(req.thread_id)


@app.get("/trace/{thread_id}")
def trace(thread_id: str):
    snapshot = _graph.get_state(_config(thread_id))
    if not snapshot.values:
        raise HTTPException(status_code=404, detail="Unknown thread_id")
    return _serialize_state(thread_id)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
        reload=True,
    )
