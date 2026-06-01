import sys
import logging
from pathlib import Path

from dotenv import load_dotenv
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import START, END, StateGraph
from langgraph.prebuilt import ToolNode

from agents.nodes import State, _make_plan_agent, _make_code_agent, _make_exec_agent, _make_plan_review_node

load_dotenv()

logger = logging.getLogger(__name__)

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
    return "plan_reviewer"

def _route_plan_reviewer(state: State):
    if state.get("plan_decision") == "revise":
        return "planner"
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
    logger.info("Loaded %d MCP tools: %s", len(tools), [t.name for t in tools])

    workflow = StateGraph(State)
    workflow.add_node("planner", _make_plan_agent(tools))
    workflow.add_node("coder", _make_code_agent(tools))
    workflow.add_node("executor", _make_exec_agent(tools))
    workflow.add_node("plan_reviewer", _make_plan_review_node(tools))
    # Two separate ToolNodes so each agent has its own routing path back to its caller:
    # tools1 → planner (web search during planning), tools → coder (file I/O during coding)
    workflow.add_node("tools", ToolNode(tools))
    workflow.add_node("tools1", ToolNode(tools))

    workflow.add_edge(START, "planner")
    workflow.add_conditional_edges(
        "planner", _route_planner, {"tools1": "tools1", "plan_reviewer": "plan_reviewer"}
    )
    workflow.add_conditional_edges(
        "plan_reviewer", _route_plan_reviewer, {"coder": "coder", "planner": "planner"}
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
