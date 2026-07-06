import json
import logging
from datetime import datetime

from dotenv import load_dotenv
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, ToolMessage
from langgraph.types import interrupt

from agents.state import PlannerState, ExecutorState
from agents.prompts import PLAN_PROMPT, CODER_PROMPT, DEBUGGER_PROMPT

load_dotenv()

logger = logging.getLogger(__name__)

llm = ChatAnthropic(model="claude-sonnet-4-6")


def _make_plan_agent(tools):
    search_web = next(t for t in tools if t.name == "search_web")
    llm_with_search = llm.bind_tools([search_web])

    async def plan_agent(state: PlannerState):
        run_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        # Reuse workspace across tool round-trips so the path doesn't change mid-plan
        workspace = state.get("workspace") or f"./workspace/run_{run_id}"
        logger.info("Planning task | workspace=%s | task=%r", workspace, state.get("task", ""))
        prompt = PLAN_PROMPT.format(task=state.get("task", ""), workspace=workspace)
        response = await llm_with_search.ainvoke([HumanMessage(content=prompt)] + state["messages"])

        # Model is making a tool call — let the graph route to tools1 and come back
        if response.tool_calls:
            return {"messages": response, "workspace": workspace}

        # content can be a list of blocks when tool use is involved
        content = response.content
        if isinstance(content, list):
            raw = " ".join(
                block["text"] for block in content
                if isinstance(block, dict) and block.get("type") == "text"
            )
        else:
            raw = content
        # The model sometimes wraps the JSON in markdown fences and, especially
        # after a web search, prefixes it with explanatory prose ("Here is the
        # plan: {...}") despite the prompt. Slice from the first { to the last }
        # so json.loads sees only the object; fall back to the raw string (and a
        # clear error) if no braces are present.
        raw = raw.strip().replace("```json", "").replace("```", "").strip()
        start, end = raw.find("{"), raw.rfind("}")
        if start != -1 and end != -1 and end > start:
            raw = raw[start:end + 1]
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            logger.error("Failed to parse plan JSON | raw=%r", raw[:500])
            raise
        logger.info("Plan created | files=%s | deps=%s", parsed["files"], parsed.get("dependencies", []))
        return {"messages": response,
                "steps": parsed["steps"],
                "files": parsed["files"],
                "file_path": parsed["entry_point"],
                "workspace": workspace,
                "dependencies": parsed.get("dependencies", [])
                }

    return plan_agent


def _make_plan_review_node(tools):
    async def plan_review(state: PlannerState):
        decision = interrupt({
            "task": state.get("task", ""),
            "workspace": state.get("workspace", ""),
            "steps": state.get("steps", ""),
            "files": state.get("files", []),
            "entry_point": state.get("file_path", ""),
            "dependencies": state.get("dependencies", []),
            "message": "Review the plan. action=approve to proceed, action=reject to try a different approach, or action=feedback with feedback text for targeted revisions.",
        })

        action = decision.get("action", "approve")
        feedback = decision.get("feedback", "").strip()

        if action == "approve":
            return {"plan_decision": "approve"}

        # reject and feedback both loop back to the planner — the difference is
        # only what we tell it. A bare reject is "try again with a different
        # approach"; feedback carries specific revision guidance. Either way,
        # the planner owns the rewrite rather than the human editing fields.
        if action == "feedback" and feedback:
            msg = f"The previous plan needs revision. Feedback:\n{feedback}"
        else:
            msg = "The previous plan was rejected. Take a different approach."

        return {
            "plan_decision": "revise",
            "messages": [HumanMessage(content=msg)],
        }
    return plan_review


def _make_code_agent(tools):
    async def code_agent(state: ExecutorState):
        error = state.get("error", "")
        file_path = state.get("file_path", "")
        workspace = state.get("workspace", "")

        if error:
            logger.warning("Debug mode | fixing error: %r", error[:120])
            code_tools = [t for t in tools if t.name in {"read_file", "write_files", "install_deps", "list_files"}]
            prompt = DEBUGGER_PROMPT.format(
                error=error,
                workspace=workspace,
                file_path=file_path,
                files=state.get("files", []),
            )
        else:
            logger.info("Code mode | generating code for workspace=%s", workspace)
            code_tools = [t for t in tools if t.name in {"write_files"}]
            prompt = CODER_PROMPT.format(
                task=state.get("task", ""),
                steps=state.get("steps", ""),
                files=state.get("files", []),
                workspace=workspace
            )

        # Only pass the most recent tool call + result pair from this agent's own loop.
        # Passing the full shared history would end with the planner's AIMessage,
        # which violates Anthropic's "must end with user/tool message" constraint.
        tool_context = []
        for msg in reversed(state["messages"]):
            if isinstance(msg, ToolMessage):
                tool_context.insert(0, msg)
            elif hasattr(msg, "tool_calls") and msg.tool_calls:
                tool_context.insert(0, msg)
                break
            else:
                break

        llm_with_tools = llm.bind_tools(code_tools)
        response = await llm_with_tools.ainvoke([HumanMessage(content=prompt)] + tool_context)
        return {"messages": response}

    return code_agent


def _make_exec_agent(tools):
    run_code = next(t for t in tools if t.name == "run_code")
    install_deps = next(t for t in tools if t.name == "install_deps")

    async def exec_agent(state: ExecutorState):
        retry_count = state.get("retry_count", 0)
        if retry_count >= 3:
            logger.error("Max retry limit reached, aborting execution")
            return {"output": "Max Retry Limit Reached"}

        logger.info("Executing code | attempt=%d | file=%s", retry_count + 1, state.get("file_path", ""))

        # Install deps until it succeeds once, tracked by the deps_installed flag
        # rather than retry_count: a failed install must be retried on later passes,
        # not skipped forever after attempt 0 (which would burn the whole retry
        # budget on run_code failing with missing packages). deps_installed rides
        # along in the return dict so a successful install survives subsequent passes.
        installed_now = {}
        deps = state.get("dependencies", [])
        if deps and not state.get("deps_installed", False):
            logger.info("Installing dependencies: %s", deps)
            install_raw = await install_deps.ainvoke({"packages": deps})
            install_result = json.loads(install_raw[0]["text"])
            if not install_result["success"]:
                logger.error("Dependency install failed: %s", install_result["error"])
                return {"error": f"dependency install failed: {install_result['error']}", "retry_count": retry_count + 1}
            installed_now = {"deps_installed": True}

        raw = await run_code.ainvoke({"file_path": state.get("file_path", "")})
        try:
            result = json.loads(raw[0]["text"])
        except (IndexError, KeyError, json.JSONDecodeError) as e:
            logger.error("Failed to parse executor result: %s", e)
            return {"error": f"executor failed to parse result: {e}", "retry_count": retry_count + 1, **installed_now}

        if result["success"]:
            logger.info("Execution succeeded")
            return {"output": result["output"], "error": "", "success": True, **installed_now}
        logger.warning("Execution failed | attempt=%d | error=%r", retry_count + 1, result["error"][:120])
        return {"error": result["error"], "retry_count": retry_count + 1, **installed_now}

    return exec_agent
