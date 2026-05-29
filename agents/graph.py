import sys
from pathlib import Path

from dotenv import load_dotenv
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import START, END, StateGraph
from langgraph.prebuilt import ToolNode

from agents.nodes import State, _make_plan_agent, _make_code_agent, _make_exec_agent

load_dotenv()

_MCP_SERVER = str(Path(__file__).parent / "mcp_server.py")

client = MultiServerMCPClient({
    "tools": {
        "command": sys.executable,
        "args": [_MCP_SERVER],
        "transport": "stdio",
    }
})


def _route_planner(state: State):
    last = state["messages"][-1]
    if hasattr(last, "tool_calls") and last.tool_calls:
        return "tools1"
    return "coder"


def _route_coder(state: State):
    last = state["messages"][-1]
    if hasattr(last, "tool_calls") and last.tool_calls:
        return "tools"
    return "executor"


def _route_executor(state: State):
    if state.get("retry_count", 0) >= 3 or state.get("success"):
        return END
    return "coder"


async def build_graph():
    tools = await client.get_tools()

    workflow = StateGraph(State)
    workflow.add_node("planner", _make_plan_agent(tools))
    workflow.add_node("coder", _make_code_agent(tools))
    workflow.add_node("executor", _make_exec_agent(tools))
    workflow.add_node("tools", ToolNode(tools))
    workflow.add_node("tools1", ToolNode(tools))

    workflow.add_edge(START, "planner")
    workflow.add_conditional_edges(
        "planner", _route_planner, {"tools1": "tools1", "coder": "coder"}
    )
    workflow.add_edge("tools1", "planner")
    workflow.add_conditional_edges(
        "coder", _route_coder, {"tools": "tools", "executor": "executor"}
    )
    workflow.add_edge("tools", "coder")
    workflow.add_conditional_edges(
        "executor", _route_executor, {END: END, "coder": "coder"}
    )

    return workflow.compile(checkpointer=MemorySaver())
