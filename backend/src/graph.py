"""
Wires planner -> retriever -> executor into a cyclic LangGraph StateGraph.

Flow:
                         ┌────────────────────────┐
                         v                        │ (more sub-tasks pending)
  START -> planner -> [human gate?] -> retriever -> executor ─┤
                              │                                │ (all done)
                     (rejected)│                                v
                              v                            synthesizer -> END
                             END

- Conditional edges: `route_after_planner`, `route_after_executor`.
- Retries: `route_after_executor` sends the run back through the retriever
  (fresh context) instead of straight back to the executor, up to
  MAX_NODE_RETRIES times, then gives up and marks the sub-task failed but
  keeps going so one bad sub-task doesn't sink the whole run.
- Human-in-the-loop checkpoint: `interrupt_before=["human_approval"]` pauses
  the graph after planning if the planner flagged the query as sensitive;
  resuming requires an external call that sets `human_approved`.
- Checkpointing: MemorySaver persists state per `thread_id` so a paused
  (or crashed) run can be resumed rather than restarted from scratch.
"""

from __future__ import annotations

import os

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from .agents.executor import executor_node
from .agents.planner import planner_node
from .agents.retriever import retriever_node
from .state import AgentState

MAX_NODE_RETRIES = int(os.getenv("MAX_NODE_RETRIES", "2"))


def human_approval_node(state: AgentState) -> dict:
    """No-op node that exists purely as an interrupt point. Execution
    pauses here (see `interrupt_before` in `build_graph`) until the caller
    resumes the graph with `human_approved` set in the state."""
    return {}  


def synthesizer_node(state: AgentState) -> dict:
    """Combine every completed sub-task's result into one final answer."""
    completed = [t for t in state.get("plan", []) if t.get("status") == "done" and t.get("result")]
    failed = [t for t in state.get("plan", []) if t.get("status") == "failed"]

    if not completed:
        final = "I wasn't able to complete this request. " + (
            f"{len(failed)} sub-task(s) failed after retries." if failed else ""
        )
    else:
        results = [t["result"].strip() for t in completed if t.get("result", "").strip()]
        joined_results = "\n\n".join(results)
        note = f"\n\n({len(failed)} sub-task(s) could not be completed.)" if failed else ""
        final = joined_results + note

    return {"final_answer": final}


def route_after_planner(state: AgentState) -> str:
    if state.get("needs_human_approval") and not state.get("human_approved"):
        return "human_approval"
    return "retriever"


def route_after_human_approval(state: AgentState) -> str:
    if state.get("human_approved") is False:
        return "end"
    return "retriever"


def route_after_executor(state: AgentState) -> str:
    idx = state.get("current_task_index", 0)
    plan = state.get("plan", [])
    if idx < len(plan):
        return "retriever"
    return "synthesizer"


def build_graph():
    graph = StateGraph(AgentState)

    graph.add_node("planner", planner_node)
    graph.add_node("human_approval", human_approval_node)
    graph.add_node("retriever", retriever_node)
    graph.add_node("executor", executor_node)
    graph.add_node("synthesizer", synthesizer_node)

    graph.add_edge(START, "planner")

    graph.add_conditional_edges(
        "planner",
        route_after_planner,
        {"human_approval": "human_approval", "retriever": "retriever"},
    )
    graph.add_conditional_edges(
        "human_approval",
        route_after_human_approval,
        {"retriever": "retriever", "end": END},
    )

    graph.add_edge("retriever", "executor")

    graph.add_conditional_edges(
        "executor",
        route_after_executor,
        {"retriever": "retriever", "synthesizer": "synthesizer"},
    )
    graph.add_edge("synthesizer", END)

    checkpointer = MemorySaver()

    return graph.compile(
        checkpointer=checkpointer,
        # Pause here so an external caller can approve/reject sensitive
        # plans before any tool calls or retrieval happen.
        interrupt_before=["human_approval"],
    )
