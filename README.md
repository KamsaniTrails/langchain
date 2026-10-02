# Multi-Agent Research Assistant (LangGraph)

A stateful multi-agent workflow — **planner → retriever → executor** — built
as a cyclic graph in LangGraph, with conditional edges, retries, and a
human-in-the-loop approval checkpoint. Local retrieval runs on FAISS; the
executor uses Gemini function calling (Google function calling) to invoke tools. A React frontend
visualizes the plan, the agent state transitions, and every tool call.

## Architecture

```
START -> planner -> [needs approval?] -> human_approval -> retriever -> executor -+
                            |  (no)                                                |
                            +------------------------> retriever                   |
                                                            ^                       |
                                                            | (sub-task failed,     |
                                                            |  retry budget left)   |
                                                            +-----------------------+
                                                                    |
                                                       (all sub-tasks handled)
                                                                    v
                                                              synthesizer -> END
```

- **planner** — decomposes the user's question into an ordered list of
  sub-tasks, and flags sensitive/ambiguous requests for human approval.
- **human_approval** — an interrupt point (`interrupt_before` in
  `graph.py`). The graph pauses here; `POST /approve` resumes it.
- **retriever** — pulls the top-k relevant chunks from the local FAISS
  index for whichever sub-task is current.
- **executor** — a tool-calling agent (Gemini function calling) that
  answers the current sub-task using the retrieved context, the
  calculator, or a re-search, retrying via the retriever on failure.
- **synthesizer** — combines every completed sub-task's result into one
  final answer.

State (including the full message trace and a log of every tool call) is
persisted per `thread_id` via LangGraph's `MemorySaver` checkpointer, so a
paused or crashed run can be resumed instead of restarted from scratch.

## Backend setup

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # then add your GOOGLE_API_KEY

# Build the FAISS index from a folder of PDFs/txt/md
python -m src.vectorstore ./path/to/your/docs

# Run the API
python -m src.main   # http://localhost:8000
```

Get a free Gemini API key at https://aistudio.google.com/apikey — the free
tier is generous enough to develop and demo this project without billing.

Run the offline-safe tests (no API key needed):

```bash
pytest tests/
```

### API

| Method | Path              | Body                                   | Purpose                          |
|--------|-------------------|-----------------------------------------|-----------------------------------|
| POST   | `/chat`            | `{ "query": "..." }`                    | Start a run                       |
| POST   | `/approve`         | `{ "thread_id": "...", "approved": true }` | Resume a paused run             |
| GET    | `/trace/{thread_id}` | —                                     | Full state for the trace view     |

## Frontend setup

```bash
cd frontend
npm install
npm run dev   # http://localhost:5173
```

Set `VITE_API_URL` (defaults to `http://localhost:8000`) if the backend
runs elsewhere.

## Notes / next steps

- Swap `MemorySaver` for `SqliteSaver`/`PostgresSaver` to persist runs
  across process restarts.
- Swap FAISS for Pinecone/Chroma by editing `src/vectorstore.py` only —
  agents talk to it through `similarity_search`, nothing else changes.
- Add a second `interrupt_before` on `executor` if you want a human to
  approve individual tool calls, not just the overall plan.
