# Coding Assistant

An agentic coding assistant powered by Claude and LangGraph, with a React frontend. Given a natural-language task, the agent plans, reviews (with human-in-the-loop), writes, and executes Python code in an isolated workspace — automatically retrying on errors.

## Repo layout

```
coding_assistant/
├── docker-compose.yaml  # Runs backend (with healthcheck) then frontend
├── CLAUDE.md          # Guidance for Claude Code when working in this repo
├── .claude/agents/    # Project subagents: langgraph-reviewer, mcp-tool-dev
├── backend/          # FastAPI + LangGraph + MCP tool server
│   ├── Dockerfile
│   ├── main.py         # FastAPI app: /run and /resume, owns the graph lifespan
│   ├── agents/
│   │   ├── graph.py           # Parent graph: START → planner → executor → END
│   │   ├── plan_subgraph.py   # Planner subgraph (planner ↔ tools, plan_reviewer)
│   │   ├── exec_subgraph.py   # Executor subgraph (coder ↔ tools, executor)
│   │   ├── nodes.py           # Node factories (planner, reviewer, coder/debugger, executor)
│   │   ├── state.py           # State / PlannerState / ExecutorState
│   │   ├── prompts.py         # PLAN_PROMPT, CODER_PROMPT, DEBUGGER_PROMPT
│   │   ├── tools.py           # Shared MCP client that launches the tool server
│   │   └── mcp_server.py      # FastMCP stdio server exposing the tools
│   ├── bruno/        # Bruno API collection (run.bru, resume.bru)
│   ├── logs/         # app.log lives here
│   ├── workspace/    # Per-run isolated output directories
│   ├── pyproject.toml
│   └── .env
└── frontend/         # React + Vite + TypeScript + Tailwind v4
    ├── Dockerfile    # Multi-stage build → nginx serves the static bundle
    ├── nginx.conf    # SPA + proxies /run and /resume to the backend
    ├── index.html
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── App.tsx
        ├── main.tsx
        ├── api.ts
        ├── types.ts
        ├── hooks/          # useAgent, useHistory, useToast
        └── components/     # Hero, TaskInput, PlanReviewer, WorkingPanel,
                            # OutputDisplay, StatusIndicator, Timeline,
                            # Sidebar, Toaster, ShortcutsModal
```

## How it works

The graph is a **parent graph** (`START → planner → executor → END`) whose two nodes are each a compiled **subgraph**. The subgraphs share state through the parent (`State` in `state.py`), so fields the planner produces — `steps`, `files`, `file_path`, `dependencies`, `workspace` — flow into the executor.

```
POST /run
  │
  ├─ Planner subgraph ──────────────────────────────────────────────┐
  │     planner ──tool call──▶ tools1 (search_web) ──▶ planner       │
  │        │                                                         │
  │        └─no tool call─▶ plan_reviewer ──interrupt──▶ POST /resume│
  │                              │  ▲                                 │
  │                     approve  │  │ reject / feedback → revise      │
  │                              │  └──────────▶ planner              │
  │                              ▼                                    │
  └─ Executor subgraph ◀─────────┘                                    │
        coder ──tool call──▶ tools (write / read / list / install) ──▶ coder
           │                                                          │
           └─no tool call─▶ executor ──success or retry_count ≥ 3──▶ done
                              │                                       │
                              └────── error → coder (debug) ─────────┘
```

1. **Planner** – generates a step-by-step plan, decides which files to create, picks an entry point, and lists required dependencies. Can call `search_web` (Tavily) for unfamiliar libraries; after a search it loops back to the planner to fold the result into the plan before proceeding to review.
2. **Plan Reviewer** – pauses the graph and surfaces the plan for human approval via a LangGraph `interrupt`. The caller resumes the run through `POST /resume` with one of three actions: `approve`, `reject` (terse "try a different approach"), or `feedback` (revise with specific guidance). Reject and feedback both loop back to the planner, which owns the rewrite.
3. **Coder** – writes all planned files to disk in one `write_files` call (multi-file). The **coder and debugger are the same node**: when the previous run left an `error`, it switches to a debugger prompt with a wider tool set (`read_file`, `list_files`, `install_deps`, `write_files`) and applies the minimal fix.
4. **Executor** – installs declared dependencies (`install_deps`, a `uv pip install` with a 120s timeout) and runs the entry point (`run_code`, 60s timeout), returning stdout. Dependency install is retried until it succeeds once (tracked by a `deps_installed` flag) rather than being tied to attempt 0, so a transient install failure doesn't burn the whole retry budget. On execution failure it routes back to the coder in debug mode, up to 3 attempts.

Each run lives in `backend/workspace/run_<timestamp>/`. Graph state is checkpointed to an on-disk SQLite store (`backend/checkpoints.sqlite`, via `langgraph-checkpoint-sqlite`) and addressed by a `thread_id` so `/resume` can target the exact pending run — and paused runs survive a backend restart.

## Quickstart (Docker)

The fastest way to run the whole stack. **Requires** Docker with Compose v2 and a `backend/.env` file (see [keys below](#backend)).

```bash
# create backend/.env with ANTHROPIC_API_KEY and TAVILY_API_KEY (see keys below)
docker compose up --build
```

Compose starts the **backend first**, waits for its healthcheck to pass, then starts the **frontend**:

| Service | URL | Notes |
|---|---|---|
| Frontend | `http://localhost:5173` | nginx serving the built bundle; proxies `/run` and `/resume` to the backend |
| Backend | `http://localhost:8000` | FastAPI; `/docs` for the OpenAPI UI |

Secrets are read from `backend/.env` (never baked into the image). Generated projects persist in the `backend_workspace` volume. Tear down with `docker compose down` (add `-v` to also drop the workspace volume).

> The agent checkpoint DB lives inside the backend container and is **not** persisted across `docker compose down`. Paused (`awaiting_review`) runs survive a container restart but not a full teardown.

## Setup (local, without Docker)

**Requirements:** Python 3.12+, [uv](https://github.com/astral-sh/uv), Node 20+.

### Backend

```bash
cd backend
uv sync
# create .env with ANTHROPIC_API_KEY and TAVILY_API_KEY (see keys below)
uv run uvicorn main:app --reload
```

The API listens on `http://localhost:8000`.

**.env keys required:**

```
ANTHROPIC_API_KEY=...
TAVILY_API_KEY=...
LANGSMITH_API_KEY=...   # optional, for LangSmith tracing
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Dev server at `http://localhost:5173`. `/run` and `/resume` are proxied to `:8000` via [vite.config.ts](frontend/vite.config.ts), so no CORS setup is needed.

## Logging

All backend logs (FastAPI, agents, MCP tools, uvicorn) are written to [backend/logs/app.log](backend/logs/app.log) **and** mirrored to the terminal (stderr). Follow the file with:

```bash
tail -f backend/logs/app.log
```

Under Docker, the same output is visible via `docker compose logs -f backend`.

## API

### `POST /run`

**Request**
```json
{
  "task": "Write a script that fetches the latest Bitcoin price and prints it",
  "thread_id": "5f2c8a1d-..."
}
```

`thread_id` is optional — if omitted, the server generates one and returns it.

**Response (plan awaiting review)**
```json
{
  "status": "awaiting_review",
  "thread_id": "5f2c8a1d-...",
  "interrupt": {
    "task": "Write a script that fetches the latest Bitcoin price and prints it",
    "workspace": "./workspace/run_20260601_120000",
    "steps": "1. ...\n2. ...",
    "files": ["./workspace/run_20260601_120000/main.py"],
    "entry_point": "./workspace/run_20260601_120000/main.py",
    "dependencies": ["requests"],
    "message": "Review the plan. action=approve to proceed, action=reject to try a different approach, or action=feedback with feedback text for targeted revisions."
  }
}
```

### `POST /resume`

Resumes a paused run after a human has reviewed the plan.

**Request**
```json
{
  "thread_id": "5f2c8a1d-...",
  "action": "feedback",
  "feedback": "Use httpx instead of requests"
}
```

| Action | Behavior |
|---|---|
| `approve` | Proceed to the coder. |
| `reject` | Loop back to the planner with a "try a different approach" message. `feedback` is ignored. |
| `feedback` | Loop back to the planner with the provided feedback. `feedback` is required. |

**Response (complete)**
```json
{
  "status": "done",
  "thread_id": "5f2c8a1d-...",
  "output": "Bitcoin price: $67,423.00\n",
  "error": "",
  "file_path": "./workspace/run_20260601_120000/main.py",
  "retry_count": 0
}
```

| Field | Description |
|---|---|
| `status` | `awaiting_review` or `done` |
| `thread_id` | identifier used to resume the run via `/resume` |
| `output` | stdout of the generated script |
| `error` | last error message if execution failed after all retries |
| `file_path` | entry-point file that was run |
| `retry_count` | number of fix-and-retry cycles (max 3) |

## Dependencies

### Backend
| Package | Purpose |
|---|---|
| `langchain` + `langchain-community` | LangChain core + community integrations |
| `langchain-anthropic` | Claude LLM integration |
| `langgraph` | Agent workflow orchestration (parent graph + subgraphs) + `interrupt` for human review |
| `langgraph-checkpoint-sqlite` | On-disk checkpointing so paused runs survive restarts |
| `langchain-mcp-adapters` | Connects LangGraph to the MCP tool server |
| `langchain-tavily` | Web search via Tavily |
| `fastapi` + `uvicorn` | HTTP API server |
| `mcp` | FastMCP stdio server for sandboxed tool execution |

### Frontend
| Package | Purpose |
|---|---|
| `react` + `react-dom` | UI |
| `vite` + `@vitejs/plugin-react` | Dev server + build |
| `tailwindcss` + `@tailwindcss/vite` | Styling (Tailwind v4) |
| `axios` | HTTP client |
| `typescript` | Types |

## Tools

The agent's tools live in a FastMCP **stdio** server (`backend/agents/mcp_server.py`) and reach the graph through a shared MCP client (`tools.py`). Nodes filter this list by name, so each node only sees the tools it should use.

| Tool | Used by | Purpose |
|---|---|---|
| `search_web` | Planner | Tavily web search for unfamiliar libraries |
| `write_files` | Coder / Debugger | Write all planned files in one call (multi-file) |
| `read_file` | Debugger | Read a failing file before fixing it |
| `list_files` | Debugger | List files in the workspace |
| `install_deps` | Executor / Debugger | `uv pip install` declared dependencies (120s timeout) |
| `run_code` | Executor | Run the entry point in its own directory (60s timeout) |

## Subagents

`.claude/agents/` holds two project subagents for Claude Code:

- **`langgraph-reviewer`** – read-only review of the orchestration layer (`graph.py`, `plan_subgraph.py`, `exec_subgraph.py`, `state.py`, `nodes.py`) against the invariants that are easy to break here: state fields flowing between subgraphs, routing edges matching node names, retry/interrupt logic, and Anthropic message-ordering.
- **`mcp-tool-dev`** – adding, modifying, or wiring MCP tools, following this repo's conventions (async, non-blocking, JSON-serializable returns, and the two places a new tool must be registered).
