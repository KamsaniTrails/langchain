"""
Tools exposed to the executor agent via Gemini function calling.

Each tool is a plain `@tool`-decorated function; LangChain turns the
docstring + type hints into the JSON schema the model sees, so keep both
accurate. The retriever agent calls `faiss_search` directly (no LLM tool
call needed there); the executor agent gets all of these bound so it can
decide which one to invoke for a given sub-task.
"""

from __future__ import annotations

from langchain_core.tools import tool

from .vectorstore import get_vectorstore


@tool
def faiss_search(query: str, k: int = 4) -> str:
    """Search the local FAISS vector index for passages relevant to `query`.
    Returns the top-k chunks concatenated with source markers, or a message
    saying nothing was found."""
    try:
        store = get_vectorstore()
        hits = store.similarity_search(query, k=k)
        if not hits:
            return "No relevant passages found in the knowledge base."

        return "\n\n".join(
            f"[source: {d.metadata.get('source', 'unknown')}]\n{d.page_content}"
            for d in hits
        )
    except Exception as e:
        return f"Knowledge base search note: {e}"


@tool
def calculator(expression: str) -> str:
    """Evaluate a basic arithmetic expression, e.g. '12 * (4 + 3)'. Only
    numbers and + - * / ( ) . are allowed."""
    allowed = set("0123456789+-*/(). ")
    if not set(expression) <= allowed:
        return "Error: expression contains disallowed characters."
    try:
        # Restricted eval: no builtins, no names.
        return str(eval(expression, {"__builtins__": {}}, {}))
    except Exception as e:  # noqa: BLE001
        return f"Error evaluating expression: {e}"


@tool
def summarize_notes(text: str) -> str:
    """Produce a short bullet-point summary of a block of text the executor
    has collected so far. Useful before handing results back to the
    planner for the next sub-task."""
    # Deliberately simple/local so the executor has a cheap tool that
    # doesn't require another full LLM round-trip for trivial cases.
    sentences = [s.strip() for s in text.replace("\n", " ").split(".") if s.strip()]
    bullets = sentences[:5]
    return "\n".join(f"- {b}." for b in bullets) if bullets else "(nothing to summarize)"


EXECUTOR_TOOLS = [faiss_search, calculator, summarize_notes]
