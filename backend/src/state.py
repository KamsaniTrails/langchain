"""
Shared state that flows through every node of the multi-agent graph.

LangGraph passes this dict-like object between nodes. Each node reads what
it needs and returns a partial update, which LangGraph merges back in using
the reducers defined below (e.g. `add_messages` appends instead of
overwriting, so we keep a full transcript / trace of the run).
"""

from __future__ import annotations

from typing import Annotated, Literal, TypedDict

from langgraph.graph.message import add_messages


class SubTask(TypedDict):
    id: str
    description: str
    status: Literal["pending", "in_progress", "done", "failed"]
    result: str | None


class ToolCallRecord(TypedDict):
    node: str
    tool: str
    input: str
    output: str


class AgentState(TypedDict):
    # Full running transcript (user turns, agent turns, tool turns).
    # `add_messages` is a LangGraph reducer: new messages are appended,
    # not overwritten, so downstream code / the UI can always replay
    # the full trace of the run.
    messages: Annotated[list, add_messages]

    # Original user query for this run.
    query: str

    # Task decomposition produced by the planner node.
    plan: list[SubTask]

    # Index of the sub-task currently being worked on by retriever/executor.
    current_task_index: int

    # Chunks pulled from FAISS for the current sub-task.
    retrieved_context: list[str]

    # Log of every tool call made anywhere in the graph, used to drive the
    # "trace" view in the frontend.
    tool_calls: Annotated[list[ToolCallRecord], lambda a, b: a + b]

    # Per-node retry counters, keyed by node name, so the graph can bail
    # out gracefully instead of looping forever on a flaky call.
    retry_counts: dict[str, int]

    # Set to True by the planner when it decides the request is sensitive /
    # ambiguous enough that a human should approve the plan before the
    # executor is allowed to run (human-in-the-loop checkpoint).
    needs_human_approval: bool
    human_approved: bool | None

    # Final synthesized answer, filled in once every sub-task is done.
    final_answer: str | None

    # Set by any node on unrecoverable failure; routes the graph to END.
    error: str | None
