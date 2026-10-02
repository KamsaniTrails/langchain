"""
Retriever agent.

For the sub-task currently pointed to by `current_task_index`, pulls the
most relevant chunks from the local FAISS index and stashes them in
`retrieved_context` for the executor to use. Logged as a tool call so it
shows up in the trace view even though it doesn't go through an LLM.
"""

from __future__ import annotations

from langchain_core.messages import AIMessage

from ..state import AgentState
from ..tools import faiss_search

RETRIEVER_SYSTEM_PROMPT = """You are the RETRIEVER agent. You do not chat with \
the user. Your only responsibility is fetching the passages from the vector \
index that are most relevant to the current sub-task, so the executor agent \
has grounded context to work from."""


def retriever_node(state: AgentState) -> dict:
    task = state["plan"][state["current_task_index"]]
    query = task["description"]

    result_text = faiss_search.invoke({"query": query, "k": 4})
    chunks = [c.strip() for c in result_text.split("\n\n") if c.strip()]

    return {
        "retrieved_context": chunks,
        "tool_calls": [
            {
                "node": "retriever",
                "tool": "faiss_search",
                "input": query,
                "output": result_text[:500],
            }
        ],
        "messages": [
            AIMessage(
                content=f"Retriever fetched {len(chunks)} chunk(s) for sub-task: {query}"
            )
        ],
    }
