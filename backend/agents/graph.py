from contextlib import asynccontextmanager

from dotenv import load_dotenv
from langgraph.graph import START, END, StateGraph
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver


from agents.state import State
from agents.plan_subgraph import _planner_subgraph
from agents.exec_subgraph import _exec_subgraph

load_dotenv()

# On-disk checkpoint store so plan/resume state survives across requests and restarts.
_CHECKPOINT_DB = "checkpoints.sqlite"


@asynccontextmanager
async def build_graph():
    workflow = StateGraph(State)
    workflow.add_node("planner", await _planner_subgraph())
    workflow.add_node("executor", await _exec_subgraph())

    workflow.add_edge(START, "planner")
    workflow.add_edge("planner", "executor")
    workflow.add_edge("executor", END)

    # AsyncSqliteSaver holds an open aiosqlite connection, so the graph is only
    # usable while this context is open — keep it alive for the app's lifetime.
    async with AsyncSqliteSaver.from_conn_string(_CHECKPOINT_DB) as checkpointer:
        await checkpointer.setup()  # creates necessary tables on first run
        yield workflow.compile(checkpointer=checkpointer)