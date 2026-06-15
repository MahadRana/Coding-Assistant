from dotenv import load_dotenv
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import START, END, StateGraph

from agents.state import State
from agents.plan_subgraph import _planner_subgraph
from agents.exec_subgraph import _exec_subgraph

load_dotenv()


async def build_graph():
    workflow = StateGraph(State)
    workflow.add_node("planner", await _planner_subgraph())
    workflow.add_node("executor", await _exec_subgraph())

    workflow.add_edge(START, "planner")
    workflow.add_edge("planner", "executor")
    workflow.add_edge("executor", END)

    return workflow.compile(checkpointer=MemorySaver())
