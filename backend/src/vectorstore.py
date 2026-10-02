"""
Wrapper around a local FAISS index used for the retriever agent.

Features:
  - Dynamic file upload and ingestion (.pdf, .txt, .md)
  - Document metadata tracking (filenames, chunks, sizes, timestamps)
  - Sample knowledge ingestion for instant testing
  - Retrieval helper for RAG workflow
"""

from __future__ import annotations

import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from langchain_text_splitters import RecursiveCharacterTextSplitter
except ImportError:
    from langchain.text_splitter import RecursiveCharacterTextSplitter

from langchain_community.document_loaders import PyPDFLoader, TextLoader
from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document
from langchain_google_genai import GoogleGenerativeAIEmbeddings

BASE_DIR = Path(__file__).resolve().parent.parent
INDEX_DIR = Path(os.getenv("FAISS_INDEX_DIR", BASE_DIR / "faiss_index"))
DOCS_DIR = BASE_DIR / "uploaded_docs"
METADATA_FILE = INDEX_DIR / "documents_meta.json"

_LOADERS = {
    ".pdf": lambda path: PyPDFLoader(str(path)).load(),
    ".txt": lambda path: TextLoader(str(path), encoding="utf-8").load(),
    ".md": lambda path: TextLoader(str(path), encoding="utf-8").load(),
}


def _get_api_key() -> str | None:
    return os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")


import hashlib
import numpy as np
from langchain_core.embeddings import Embeddings

class FastLocalEmbeddings(Embeddings):
    """Deterministic local embedding fallback when remote Google API quota or permission is restricted."""
    def __init__(self, dim: int = 256):
        self.dim = dim

    def _embed(self, text: str) -> list[float]:
        vec = np.zeros(self.dim, dtype=np.float32)
        words = text.lower().split()
        for word in words:
            h = int(hashlib.md5(word.encode("utf-8")).hexdigest(), 16)
            idx = h % self.dim
            vec[idx] += 1.0
        norm = float(np.linalg.norm(vec))
        if norm > 0:
            vec = vec / norm
        return vec.tolist()

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._embed(t) for t in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._embed(text)


_CACHED_EMBEDDINGS: Embeddings | None = None
_CACHED_KEY: str | None = None


def _embeddings() -> Embeddings:
    global _CACHED_EMBEDDINGS, _CACHED_KEY
    api_key = _get_api_key()
    if _CACHED_EMBEDDINGS is not None and _CACHED_KEY == api_key:
        return _CACHED_EMBEDDINGS

    _CACHED_KEY = api_key
    if api_key:
        try:
            emb = GoogleGenerativeAIEmbeddings(
                model=os.getenv("GEMINI_EMBEDDING_MODEL", "models/gemini-embedding-001"),
                google_api_key=api_key,
            )
            emb.embed_query("test")
            _CACHED_EMBEDDINGS = emb
            return emb
        except Exception as e:
            print(f"Notice: Google Embeddings API returned ({e}). Using FastLocalEmbeddings fallback.")

    _CACHED_EMBEDDINGS = FastLocalEmbeddings()
    return _CACHED_EMBEDDINGS



def _load_metadata() -> dict[str, Any]:
    if METADATA_FILE.exists():
        try:
            with open(METADATA_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"documents": [], "total_chunks": 0, "last_updated": None}


def _save_metadata(meta: dict[str, Any]) -> None:
    INDEX_DIR.mkdir(parents=True, exist_ok=True)
    with open(METADATA_FILE, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)


def get_indexed_documents() -> dict[str, Any]:
    """Returns metadata of currently indexed documents and index status."""
    meta = _load_metadata()
    has_index = (INDEX_DIR / "index.faiss").exists()
    return {
        "has_index": has_index,
        "total_chunks": meta.get("total_chunks", 0),
        "documents": meta.get("documents", []),
        "last_updated": meta.get("last_updated"),
    }


def load_file_chunks(file_path: Path) -> list[Document]:
    ext = file_path.suffix.lower()
    loader_fn = _LOADERS.get(ext)
    if not loader_fn:
        raise ValueError(f"Unsupported file type '{ext}'. Supported: .pdf, .txt, .md")

    raw_docs = loader_fn(file_path)
    for doc in raw_docs:
        doc.metadata["source"] = file_path.name
        doc.metadata["file_name"] = file_path.name

    splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=120)
    return splitter.split_documents(raw_docs)


def reindex_all_documents() -> int:
    """Rebuilds the entire FAISS index from files present in DOCS_DIR."""
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    INDEX_DIR.mkdir(parents=True, exist_ok=True)

    all_chunks: list[Document] = []
    doc_entries: list[dict[str, Any]] = []

    for file_path in DOCS_DIR.iterdir():
        if file_path.is_file() and file_path.suffix.lower() in _LOADERS:
            try:
                chunks = load_file_chunks(file_path)
                all_chunks.extend(chunks)
                doc_entries.append(
                    {
                        "name": file_path.name,
                        "size": file_path.stat().st_size,
                        "chunks": len(chunks),
                        "uploaded_at": datetime.fromtimestamp(
                            file_path.stat().st_mtime, timezone.utc
                        ).isoformat(),
                    }
                )
            except Exception as e:
                print(f"Error processing {file_path.name}: {e}")

    if all_chunks:
        embeddings = _embeddings()
        store = FAISS.from_documents(all_chunks, embeddings)
        store.save_local(str(INDEX_DIR))
    else:
        # If no chunks left, remove existing index files
        for f in INDEX_DIR.glob("index.*"):
            try:
                f.unlink()
            except Exception:
                pass

    _save_metadata(
        {
            "documents": doc_entries,
            "total_chunks": len(all_chunks),
            "last_updated": datetime.now(timezone.utc).isoformat(),
        }
    )
    return len(all_chunks)


def save_and_ingest_file(filename: str, content_bytes: bytes) -> dict[str, Any]:
    """Saves an uploaded file to DOCS_DIR and reindexes."""
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = Path(filename).name
    target_path = DOCS_DIR / safe_name

    with open(target_path, "wb") as f:
        f.write(content_bytes)

    total_chunks = reindex_all_documents()
    return {
        "filename": safe_name,
        "size": len(content_bytes),
        "total_chunks": total_chunks,
        "message": f"Successfully ingested {safe_name}.",
    }


def delete_document(filename: str) -> dict[str, Any]:
    """Deletes a document from DOCS_DIR and reindexes."""
    safe_name = Path(filename).name
    target_path = DOCS_DIR / safe_name
    if target_path.exists():
        target_path.unlink()
    total_chunks = reindex_all_documents()
    return {
        "filename": safe_name,
        "total_chunks": total_chunks,
        "message": f"Deleted {safe_name}.",
    }


def clear_all_documents() -> dict[str, Any]:
    """Clears all uploaded documents and resets FAISS index."""
    if DOCS_DIR.exists():
        for f in DOCS_DIR.iterdir():
            if f.is_file():
                try:
                    f.unlink()
                except Exception:
                    pass

    if INDEX_DIR.exists():
        for f in INDEX_DIR.iterdir():
            if f.is_file():
                try:
                    f.unlink()
                except Exception:
                    pass

    _save_metadata({"documents": [], "total_chunks": 0, "last_updated": None})
    return {"message": "Knowledge base cleared."}


def load_sample_knowledge() -> dict[str, Any]:
    """Creates a sample profile and research document and indexes it."""
    sample_content = """# Profile & Research Summary

## Personal & Professional Profile
- Name: Jayasurya
- Role: Full Stack AI Engineer & LangGraph Specialist
- Experience: Developing multi-agent workflows, stateful graphs, LLM tooling, and RAG pipelines.
- Core Skills: Python, LangGraph, FastAPI, React, FAISS, Gemini API, Vector Embeddings.

## Current Project Architecture
The project is a stateful multi-agent research assistant built with:
1. Planner Agent: Decomposes user questions into structured sub-tasks and flags sensitive requests.
2. Human-in-the-loop Gate: Requires user confirmation before executing critical operations.
3. Retriever Agent: Vector search over local FAISS knowledge store using text-embedding-004.
4. Executor Agent: Tool-calling agent equipped with calculator, document retriever, and summarizer.
5. Synthesizer Agent: Aggregates sub-task findings into an executive briefing with citations.

## Benchmarks & Evaluation
- Retrieval Precision: 94.2% across domain queries
- Average Latency: 1.4 seconds per sub-task
- Fault Tolerance: Automatic edge loop retry up to 2 attempts upon execution failures.
"""
    return save_and_ingest_file("sample_profile_and_research.md", sample_content.encode("utf-8"))


def ingest_documents(source_dir: str) -> int:
    """CLI compatibility function."""
    source_path = Path(source_dir)
    if not source_path.exists():
        raise ValueError(f"Directory {source_dir} does not exist.")

    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    for f in source_path.iterdir():
        if f.is_file() and f.suffix.lower() in _LOADERS:
            shutil.copy2(f, DOCS_DIR / f.name)

    return reindex_all_documents()


def get_vectorstore() -> FAISS:
    index_file = INDEX_DIR / "index.faiss"
    if not index_file.exists():
        raise FileNotFoundError(
            f"No FAISS index found. Please upload documents in the Knowledge Base tab first."
        )
    return FAISS.load_local(
        str(INDEX_DIR), _embeddings(), allow_dangerous_deserialization=True
    )


if __name__ == "__main__":
    import sys

    if len(sys.argv) != 2:
        print("Usage: python -m src.vectorstore <path-to-docs-folder>")
        raise SystemExit(1)

    n = ingest_documents(sys.argv[1])
    print(f"Ingested {n} chunks into {INDEX_DIR}")
