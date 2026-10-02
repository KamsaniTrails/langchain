"""
Planner agent.

Takes the raw user query and decomposes it into an ordered list of
sub-tasks for the retriever/executor loop to work through. Also decides
whether the plan is sensitive/ambiguous enough to need a human-in-the-loop
approval checkpoint before execution starts.
"""

from __future__ import annotations

import json
import os
import uuid

from langchain_core.messages import AIMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from ..state import AgentState, SubTask

PLANNER_SYSTEM_PROMPT = """You are the PLANNER agent in a multi-agent research \
assistant. Your only job is to break the user's question down into a short, \
ordered list of concrete, independently-answerable sub-tasks that a retrieval \
+ execution pipeline can work through one at a time.

Rules:
- Prefer 1-4 sub-tasks. Do not over-decompose simple questions.
- Each sub-task description should be self-contained (assume the executor \
has no memory of the original question besides what you write).
- If the question involves anything sensitive (medical, legal, financial \
decisions with real-world consequences) or is ambiguous enough that acting \
on the wrong interpretation would waste significant work, set \
"needs_human_approval": true.
- Respond with ONLY valid JSON, no prose, no markdown fences, shaped exactly like:
{"subtasks": ["first sub-task", "second sub-task"], "needs_human_approval": false}
"""


def planner_node(state: AgentState) -> dict:
    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError(
            "Gemini API key is required. Please configure your GOOGLE_API_KEY in the Settings menu or in backend/.env."
        )

    subtask_descriptions = []
    needs_approval = False

    try:
        llm = ChatGoogleGenerativeAI(
            model=os.getenv("GEMINI_MODEL", "gemini-3.8-flash"),
            temperature=0,
            google_api_key=api_key,
        )

        response = llm.invoke(
            [
                SystemMessage(content=PLANNER_SYSTEM_PROMPT),
                *state["messages"],
            ]
        )

        raw = response.content.strip()
        if raw.startswith("```"):
            raw = raw.strip("`")
            raw = raw[4:] if raw.lower().startswith("json") else raw

        parsed = json.loads(raw)
        subtask_descriptions = parsed["subtasks"]
        needs_approval = bool(parsed.get("needs_human_approval", False))
    except Exception as exc:
        print(f"Notice: Planner LLM fallback used ({exc})")
        q = state.get("query", "")
        if any(w in q.lower() for w in ["name", "job", "who", "role", "work", "profile"]):
            subtask_descriptions = [
                f"Search knowledge base for personal and professional profile details related to '{q}'",
                "Synthesize name, designation, and background from retrieved records"
            ]
        elif any(w in q.lower() for w in ["calculate", "math", "sum", "+", "*"]):
            subtask_descriptions = [
                f"Evaluate mathematical expressions in query: {q}",
                "Interpret calculation results in context"
            ]
        else:
            subtask_descriptions = [
                f"Retrieve relevant passages from knowledge base for: {q}",
                f"Analyze and synthesize answer for: {q}"
            ]
        needs_approval = False

    plan: list[SubTask] = [
        SubTask(id=str(uuid.uuid4())[:8], description=d, status="pending", result=None)
        for d in subtask_descriptions
    ]

    return {
        "plan": plan,
        "current_task_index": 0,
        "needs_human_approval": needs_approval,
        "human_approved": None if needs_approval else True,
        "messages": [
            AIMessage(
                content=f"Planner produced {len(plan)} sub-task(s): "
                + "; ".join(t['description'] for t in plan)
            )
        ],
    }
