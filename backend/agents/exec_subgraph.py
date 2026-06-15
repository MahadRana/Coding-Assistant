from langgraph.graph import START, END, StateGraph
from langgraph.prebuilt import ToolNode

from agents.state import ExecutorState
from agents.tools import get_tools
from agents.nodes import _make_code_agent, _make_exec_agent


def _route_coder(state: ExecutorState):
    last = state["messages"][-1]
    if hasattr(last, "tool_calls") and last.tool_calls:
        return "tools"
    return "executor"


def _route_executor(state: ExecutorState):
    if state.get("retry_count", 0) >= 3 or state.get("success"):
        return END
    return "coder"


async def _exec_subgraph():
    workflow = StateGraph(ExecutorState)
    tools = await get_tools()
    workflow.add_node("coder", _make_code_agent(tools))
    workflow.add_node("executor", _make_exec_agent(tools))
    workflow.add_node("tools", ToolNode(tools))
    workflow.add_edge(START, "coder")
    workflow.add_conditional_edges(
        "coder", _route_coder, {"tools": "tools", "executor": "executor"}
    )
    workflow.add_edge("tools", "coder")
    workflow.add_conditional_edges(
        "executor", _route_executor, {END: END, "coder": "coder"}
    )
    return workflow.compile()
