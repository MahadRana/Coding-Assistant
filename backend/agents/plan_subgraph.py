from langgraph.graph import START, END, StateGraph
from langgraph.prebuilt import ToolNode

from agents.state import PlannerState
from agents.tools import get_tools
from agents.nodes import _make_plan_agent, _make_plan_review_node


def _route_planner(state: PlannerState):
    last = state["messages"][-1]
    if hasattr(last, "tool_calls") and last.tool_calls:
        return "tools1"
    return "plan_reviewer"


def _route_plan_reviewer(state: PlannerState):
    if state.get("plan_decision") == "revise":
        return "planner"
    return END


async def _planner_subgraph():
    workflow = StateGraph(PlannerState)
    tools = await get_tools()
    workflow.add_node("planner", _make_plan_agent(tools))
    workflow.add_node("plan_reviewer", _make_plan_review_node(tools))
    workflow.add_node("tools1", ToolNode(tools))
    workflow.add_edge(START, "planner")
    workflow.add_conditional_edges(
        "planner", _route_planner, {"tools1": "tools1", "plan_reviewer": "plan_reviewer"}
    )
    workflow.add_conditional_edges(
        "plan_reviewer", _route_plan_reviewer, {END: END, "planner": "planner"}
    )
    return workflow.compile()
