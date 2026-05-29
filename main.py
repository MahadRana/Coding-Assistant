from uuid import uuid4
from fastapi import FastAPI
from pydantic import BaseModel
from contextlib import asynccontextmanager
from langchain_core.messages import HumanMessage
from agents.graph import build_graph

graph = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global graph
    graph = await build_graph()
    yield

app = FastAPI(lifespan=lifespan)

class TaskRequest(BaseModel):
    task: str

@app.post("/run")
async def run_agent(request: TaskRequest):
    config = {"configurable": {"thread_id": str(uuid4())}}
    result = await graph.ainvoke(
        {"messages": [HumanMessage(content=request.task)], "task": request.task},
        config
    )
    return {
        "output": result.get("output", ""),
        "error": result.get("error", ""),
        "file_path": result.get("file_path", ""),
        "retry_count": result.get("retry_count", 0)
    }