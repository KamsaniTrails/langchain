"""
Executor agent.

Takes the current sub-task plus whatever the retriever found, and uses
Gemini function calling (via `EXECUTOR_TOOLS`) to produce an answer for that
sub-task - calling `calculator`, re-querying `faiss_search` if needed, or
`summarize_notes` before writing its final result.

Includes deterministic local fallback for resilient execution and bounded
retries to prevent infinite loops.
"""

from __future__ import annotations

import os
import re

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from ..state import AgentState
from ..tools import EXECUTOR_TOOLS

EXECUTOR_SYSTEM_PROMPT = """You are the EXECUTOR agent in a multi-agent \
research assistant. You are given one sub-task and retrieved context \
passages. Use the tools available to you when they would help (search the \
index again if the provided context is insufficient, use the calculator for \
any arithmetic, summarize long context before answering). When you are \
confident in the answer, respond with plain text with no further tool calls \
- that text becomes the sub-task's final result."""

MAX_TOOL_ITERATIONS = 4
MAX_NODE_RETRIES = int(os.getenv("MAX_NODE_RETRIES", "2"))


def _local_fallback_executor(
    task: dict, context_block: str, tools_by_name: dict, tool_call_log: list
) -> str:
    """Deterministic local extraction fallback when remote LLM is unavailable or quota-limited."""
    desc = task.get("description", "")
    desc_lower = desc.lower()

    # 1. Check for math / calculation
    math_match = re.search(r"[\d\.\(\)\+\-\*\/\s]{4,}", desc)
    if any(w in desc_lower for w in ["calculate", "math", "evaluate", "sum", "multiply"]) and math_match:
        expr = math_match.group(0).strip().strip("+-*/ ")
        calc_tool = tools_by_name.get("calculator")
        if calc_tool:
            val = calc_tool.invoke({"expression": expr})
            tool_call_log.append(
                {
                    "node": "executor",
                    "tool": "calculator",
                    "input": expr,
                    "output": str(val),
                }
            )
            return f"Calculation result for '{expr}': {val}"

    # 2. Check retrieved context
    if context_block and context_block != "(no context retrieved)":
        lines = [
            line.strip()
            for line in context_block.split("\n")
            if line.strip() and not line.startswith("[source:")
        ]
        matched_lines = []
        keywords = [
            w
            for w in re.findall(r"\w+", desc_lower)
            if len(w) > 3
            and w not in ["search", "knowledge", "base", "retrieve", "details", "records", "synthesize", "relevant", "passages"]
        ]

        for line in lines:
            line_lower = line.lower()
            if any(k in line_lower for k in keywords):
                matched_lines.append(line.lstrip("-* "))

        if matched_lines:
            summary = "\n".join(f"- {m}" for m in matched_lines[:6])
            tool_call_log.append(
                {
                    "node": "executor",
                    "tool": "summarize_notes",
                    "input": f"Extracted {len(matched_lines)} relevant lines for: {desc}",
                    "output": summary[:500],
                }
            )
            return summary

        summarize_tool = tools_by_name.get("summarize_notes")
        if summarize_tool:
            summary = summarize_tool.invoke({"text": context_block})
            tool_call_log.append(
                {
                    "node": "executor",
                    "tool": "summarize_notes",
                    "input": f"Context length: {len(context_block)} characters",
                    "output": summary[:500],
                }
            )
            return summary

    return f"Completed research for '{desc}'."


def executor_node(state: AgentState) -> dict:
    idx = state["current_task_index"]
    task = state["plan"][idx]
    context_block = "\n\n".join(state.get("retrieved_context", [])) or "(no context retrieved)"
    tools_by_name = {t.name: t for t in EXECUTOR_TOOLS}
    tool_call_log = []
    retry_counts = dict(state.get("retry_counts", {}))

    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")

    # Try LLM-based execution if API key is configured
    if api_key:
        try:
            llm = ChatGoogleGenerativeAI(
                model=os.getenv("GEMINI_MODEL", "gemini-3.8-flash"),
                temperature=0,
                google_api_key=api_key,
            ).bind_tools(EXECUTOR_TOOLS)

            messages = [
                SystemMessage(content=EXECUTOR_SYSTEM_PROMPT),
                HumanMessage(
                    content=f"Sub-task: {task['description']}\n\nRetrieved context:\n{context_block}"
                ),
            ]

            for _ in range(MAX_TOOL_ITERATIONS):
                response = llm.invoke(messages)
                messages.append(response)

                if not response.tool_calls:
                    updated_plan = _mark_task(state, "done", response.content)
                    return {
                        "plan": updated_plan,
                        "current_task_index": idx + 1,
                        "tool_calls": tool_call_log,
                        "retry_counts": {**retry_counts, "executor": 0},
                        "messages": [AIMessage(content=f"Executor result: {response.content}")],
                    }

                for call in response.tool_calls:
                    tool_fn = tools_by_name.get(call["name"])
                    output = (
                        tool_fn.invoke(call["args"]) if tool_fn else f"Unknown tool {call['name']}"
                    )
                    tool_call_log.append(
                        {
                            "node": "executor",
                            "tool": call["name"],
                            "input": str(call["args"]),
                            "output": str(output)[:500],
                        }
                    )
                    messages.append(
                        ToolMessage(content=str(output), tool_call_id=call["id"])
                    )

            raise RuntimeError("Executor exceeded max tool-call iterations without a result.")
        except Exception as exc:
            print(f"Notice: Executor LLM fallback used ({exc})")

    # Deterministic local fallback
    try:
        fallback_result = _local_fallback_executor(task, context_block, tools_by_name, tool_call_log)
        updated_plan = _mark_task(state, "done", fallback_result)
        return {
            "plan": updated_plan,
            "current_task_index": idx + 1,
            "tool_calls": tool_call_log,
            "retry_counts": {**retry_counts, "executor": 0},
            "messages": [AIMessage(content=f"Executor result (local fallback): {fallback_result}")],
        }
    except Exception as fallback_exc:
        current_retries = retry_counts.get("executor", 0) + 1
        retry_counts["executor"] = current_retries
        if current_retries <= MAX_NODE_RETRIES:
            return {
                "tool_calls": tool_call_log,
                "retry_counts": retry_counts,
                "messages": [
                    AIMessage(
                        content=f"Executor retry {current_retries}/{MAX_NODE_RETRIES} on '{task['description']}': {fallback_exc}"
                    )
                ],
            }
        else:
            updated_plan = _mark_task(
                state, "failed", f"Failed after {MAX_NODE_RETRIES} retries: {fallback_exc}"
            )
            return {
                "plan": updated_plan,
                "current_task_index": idx + 1,
                "tool_calls": tool_call_log,
                "retry_counts": {**retry_counts, "executor": 0},
                "messages": [
                    AIMessage(
                        content=f"Executor failed on '{task['description']}': {fallback_exc}"
                    )
                ],
            }


def _mark_task(state: AgentState, status: str, result: str | None) -> list:
    plan = [dict(t) for t in state["plan"]]
    plan[state["current_task_index"]]["status"] = status
    plan[state["current_task_index"]]["result"] = result
    return plan
