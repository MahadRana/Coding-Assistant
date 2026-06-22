import logging
import logging.config
from pathlib import Path
from uuid import uuid4
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from contextlib import asynccontextmanager
from langchain_core.messages import HumanMessage
from langgraph.types import Command
from agents.graph import build_graph

_LOG_DIR = Path("logs")
_LOG_DIR.mkdir(exist_ok=True)

_fmt = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
_datefmt = "%Y-%m-%d %H:%M:%S"

logging.basicConfig(
    level=logging.INFO,
    format=_fmt,
    datefmt=_datefmt,
    handlers=[
        logging.FileHandler(_LOG_DIR / "app.log"),
        logging.StreamHandler(),  # mirror to the terminal so startup/requests are visible
    ],
)
# Silence uvicorn's default stdout/stderr handlers so logs only land in the file.
for _name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
    _ulog = logging.getLogger(_name)
    _ulog.handlers.clear()
    _ulog.propagate = True
logger = logging.getLogger(__name__)

graph = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global graph
    logger.info("Building agent graph...")
    async with build_graph() as g:
        graph = g
        logger.info("Agent graph ready")
        yield
        graph = None

app = FastAPI(lifespan=lifespan)

class TaskRequest(BaseModel):
    task: str
    # Client-generated thread id lets the frontend correlate /run with /resume
    # without a round-trip. Falls back to a server-side UUID if omitted.
    thread_id: str | None = None

class ResumeRequest(BaseModel):
    thread_id: str
    action: str  # "approve" | "reject" | "feedback"
    feedback: str = ""


_VALID_ACTIONS = {"approve", "reject", "feedback"}


def _format_result(result: dict, thread_id: str) -> dict:
    # Graph paused at the plan_reviewer interrupt — surface the plan to the user.
    if "__interrupt__" in result:
        plan = result["__interrupt__"][0].value
        logger.info("Plan awaiting review | thread=%s", thread_id)
        return {
            "status": "awaiting_review",
            "thread_id": thread_id,
            "interrupt": {
                "steps": plan.get("steps", ""),
                "files": plan.get("files", []),
                "dependencies": plan.get("dependencies", []),
                "message": plan.get("message", ""),
            },
        }

    success = result.get("success", False)
    retries = result.get("retry_count", 0)
    if success:
        logger.info("Task complete | thread=%s | retries=%d", thread_id, retries)
    else:
        logger.warning("Task failed | thread=%s | retries=%d | error=%r", thread_id, retries, result.get("error", ""))
    return {
        "status": "done",
        "thread_id": thread_id,
        "output": result.get("output", ""),
        "error": result.get("error", ""),
        "file_path": result.get("file_path", ""),
        "retry_count": retries,
    }


@app.post("/run")
async def run_agent(request: TaskRequest):
    thread_id = request.thread_id or str(uuid4())
    logger.info("Task received | thread=%s | task=%r", thread_id, request.task)
    config = {"configurable": {"thread_id": thread_id}}
    result = await graph.ainvoke(
        {"messages": [HumanMessage(content=request.task)], "task": request.task},
        config,
    )
    return _format_result(result, thread_id)


@app.post("/resume")
async def resume_agent(request: ResumeRequest):
    action = request.action.lower()
    if action not in _VALID_ACTIONS:
        raise HTTPException(
            status_code=400,
            detail="action must be 'approve', 'reject', or 'feedback'",
        )
    if action == "feedback" and not request.feedback.strip():
        raise HTTPException(
            status_code=400,
            detail="feedback is required when action is 'feedback'",
        )

    logger.info("Plan review | thread=%s | action=%s", request.thread_id, action)
    config = {"configurable": {"thread_id": request.thread_id}}
    result = await graph.ainvoke(
        Command(resume={"action": action, "feedback": request.feedback}),
        config,
    )
    return _format_result(result, request.thread_id)
