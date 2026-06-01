# Coding Assistant

An agentic coding assistant powered by Claude and LangGraph. Given a natural-language task, it plans, reviews, writes, and executes Python code in an isolated workspace — automatically retrying on errors, with a human-in-the-loop checkpoint between planning and coding.

## How it works

```
POST /run  →  Planner  →  Plan Reviewer  →  Coder  →  Executor
                ↑ (web search)   ↑ (human approval)   ↑ (file I/O)   ↓ (success or error → debugger retry)
                                  ↓ (reject + feedback)
                                Planner
```

1. **Planner** – generates a step-by-step plan, decides which files to create, picks an entry point, and lists required dependencies. Can search the web (Tavily) for unfamiliar libraries.
2. **Plan Reviewer** – pauses the graph and surfaces the plan for human approval via a LangGraph `interrupt`. The caller resumes the run through `POST /review` with `approve` or `reject` + feedback. Rejection loops back to the planner with the feedback as a new user message.
3. **Coder** – writes all planned files to disk in one `write_files` call (multi-file support). In retry mode, it switches to a debugger prompt: reads the failing file and applies the minimal fix.
4. **Executor** – installs declared dependencies on the first attempt (via `uv pip install`), runs the entry-point script with a 60s timeout, and returns stdout. Routes back to the coder on failure (up to 3 attempts).

Each run lives in its own workspace at `./workspace/run_<timestamp>/` so files don't collide between runs. Graph state is checkpointed in memory and addressed by a `thread_id` so `/review` can resume the exact pending run.

## Setup

**Requirements:** Python 3.12+, [uv](https://github.com/astral-sh/uv)

```bash
uv sync
cp .env.example .env   # add your API keys (see below)
```

**.env keys required:**

```
ANTHROPIC_API_KEY=...
TAVILY_API_KEY=...
```

## Running

```bash
uv run uvicorn main:app --reload
```

The API is available at `http://localhost:8000`.

## Logging

All logs (FastAPI, agents, MCP tools) are written to [logs/app.log](logs/app.log). Nothing is written to the terminal — tail the file to follow along:

```bash
tail -f logs/app.log
```

## API

### `POST /run`

Submits a task. Returns either a plan awaiting review, or — if the planner short-circuits — a completed result.

**Request**
```json
{ "task": "Write a script that fetches the latest Bitcoin price and prints it" }
```

**Response (plan awaiting review)**
```json
{
  "status": "awaiting_review",
  "thread_id": "5f2c…",
  "plan": {
    "task": "...",
    "workspace": "./workspace/run_20260601_120000",
    "steps": "1. ...\n2. ...",
    "files": ["./workspace/run_20260601_120000/main.py"],
    "entry_point": "./workspace/run_20260601_120000/main.py",
    "dependencies": ["requests"],
    "message": "Review the plan. Reply with action=approve to proceed, or action=reject with feedback to revise."
  }
}
```

### `POST /review`

Resumes a paused run after a human has reviewed the plan.

**Request**
```json
{
  "thread_id": "5f2c…",
  "action": "approve",
  "feedback": ""
}
```

- `action`: `"approve"` to proceed to the coder, or `"reject"` to send the plan back to the planner.
- `feedback`: required when rejecting; flows back to the planner as a new user message.

**Response (complete)**
```json
{
  "status": "complete",
  "thread_id": "5f2c…",
  "output": "Bitcoin price: $67,423.00\n",
  "error": "",
  "file_path": "./workspace/run_20260601_120000/main.py",
  "retry_count": 0
}
```

| Field | Description |
|---|---|
| `status` | `awaiting_review` or `complete` |
| `thread_id` | identifier used to resume the run via `/review` |
| `output` | stdout of the generated script |
| `error` | last error message if execution failed after all retries |
| `file_path` | entry-point file that was run |
| `retry_count` | number of fix-and-retry cycles (max 3) |

## Project structure

```
coding_assistant/
├── main.py                  # FastAPI app, lifespan, /run and /review endpoints, logging setup
├── agents/
│   ├── graph.py             # LangGraph workflow + routing
│   ├── nodes.py             # Planner, plan-reviewer, coder/debugger, executor nodes
│   └── mcp_server.py        # MCP tool server (run_code, read_file, write_files, list_files, install_deps, search_web)
├── bruno/                   # Bruno API collection for hitting /run and /review
├── logs/                    # app.log lives here (file-only logging)
├── workspace/               # Per-run isolated output directories
├── pyproject.toml
└── .env
```

## Dependencies

| Package | Purpose |
|---|---|
| `langchain-anthropic` | Claude LLM integration |
| `langgraph` | Agent workflow orchestration + `interrupt` for human review |
| `langchain-mcp-adapters` | Connects LangGraph to the MCP tool server |
| `langchain-tavily` | Web search via Tavily |
| `fastapi` + `uvicorn` | HTTP API server |
| `mcp` | MCP server for sandboxed tool execution |
