import json
import logging
from dotenv import load_dotenv
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, ToolMessage
from langgraph.graph import MessagesState
from datetime import datetime
from langgraph.types import interrupt

load_dotenv()

logger = logging.getLogger(__name__)

llm = ChatAnthropic(model="claude-sonnet-4-6")


class State(MessagesState):
    task: str = ""
    plan_decision: str = ""
    workspace: str = ""
    dependencies: list[str] = []
    steps: str = ""
    files: list[str] = []
    file_path: str = ""
    error: str = ""
    retry_count: int = 0
    output: str = ""
    success: bool = False


_PLAN_PROMPT = """\
You are a coding planner. Your job is to take the user's task and produce a clear, \
numbered step-by-step plan.

Task: {task}
Workspace: {workspace}

Rules:
- All file paths must be inside {workspace}/
- Each step should be specific and actionable
- Make all decisions and assumptions yourself — the coder should only need to follow the steps
- Include what libraries to use, what functions to create, and what the expected output is
- Format: numbered list, one step per line
- If something is unfamiliar, perform an internet search instead of guessing
- Create a list of file_paths that need to be created for the completion of the project
- Make sure that all the files in the file_paths have a proper separation of duties and follow best coding practices
- Create an entry_point file_path that will be used to run the codebase
- Use [] for dependencies if only the standard library is needed

Return ONLY raw JSON with no markdown, no backticks, and no explanation in EXACTLY this format:
{{"steps": "1. step one\n2. step two", "files": ["{workspace}/main.py", "{workspace}/utils.py"], "entry_point": "{workspace}/main.py", "dependencies": ["requests", "numpy"]}}
"""

_CODER_PROMPT = """\
You are a coder. Take the steps the planner gave and generate efficient code that \
accomplishes the task.

Task: {task}
Steps: {steps}
Files: {files}
Workspace: {workspace}

Rules:
- Code must compile
- Follow the steps exactly — no assumptions or decisions of your own
- Write the Code to the file_paths given in Files using write_files
- Call write_files with a dict: {{"{workspace}/main.py": "code here", "{workspace}/utils.py": "code here"}}
- Return only the file path when done, no explanation
- Once write_files succeeds, stop immediately — do not read back or verify the file
- Do not call any other tools after write_files"""

_DEBUGGER_PROMPT = """\
You are a debugger. Fix the issue below so the code runs correctly.

Error: {error}
Entry point: {file_path}
All project files: {files}
Workspace: {workspace}

Rules:
- Use the error and your judgement to determine what needs to change
- Only use file paths from the "All project files" list — never invent names
- Read any file you need with read_file before modifying it
- Write fixes back with write_files
- Use install_deps if packages are missing
- Make the minimal change needed — do not change the overall goal
- Return only the fixed file path when done, no explanation"""


def _make_plan_agent(tools):
    search_web = next(t for t in tools if t.name == "search_web")
    llm_with_search = llm.bind_tools([search_web])

    async def plan_agent(state: State):
        run_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        # Reuse workspace across tool round-trips so the path doesn't change mid-plan
        workspace = state.get("workspace") or f"./workspace/run_{run_id}"
        logger.info("Planning task | workspace=%s | task=%r", workspace, state.get("task", ""))
        prompt = _PLAN_PROMPT.format(task=state.get("task", ""), workspace=workspace)
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
        # LLM sometimes wraps JSON in markdown code fences; strip them before parsing
        raw = raw.strip().replace("```json", "").replace("```", "").strip()
        parsed = json.loads(raw)
        logger.info("Plan created | files=%s | deps=%s", parsed["files"], parsed.get("dependencies", []))
        return {"messages": response,
                "steps": parsed["steps"],
                "files": parsed["files"],
                "file_path": parsed["entry_point"],
                "workspace": workspace,
                "dependencies": parsed.get("dependencies", [])
                }

    return plan_agent


def _make_code_agent(tools):
    async def code_agent(state: State):
        error = state.get("error", "")
        file_path = state.get("file_path", "")
        workspace = state.get("workspace", "")

        if error:
            logger.warning("Debug mode | fixing error: %r", error[:120])
            code_tools = [t for t in tools if t.name in {"read_file", "write_files", "install_deps", "list_files"}]
            prompt = _DEBUGGER_PROMPT.format(
                error=error,
                workspace=workspace,
                file_path=file_path,
                files=state.get("files", []),
            )
        else:
            logger.info("Code mode | generating code for workspace=%s", workspace)
            code_tools = [t for t in tools if t.name in {"write_files"}]
            prompt = _CODER_PROMPT.format(
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

    async def exec_agent(state: State):
        retry_count = state.get("retry_count", 0)
        if retry_count >= 3:
            logger.error("Max retry limit reached, aborting execution")
            return {"output": "Max Retry Limit Reached"}

        logger.info("Executing code | attempt=%d | file=%s", retry_count + 1, state.get("file_path", ""))

        # Deps are installed once upfront; retries re-use whatever was already installed
        if retry_count == 0:
            deps = state.get("dependencies", [])
            if deps:
                logger.info("Installing dependencies: %s", deps)
                install_raw = await install_deps.ainvoke({"packages": deps})
                install_result = json.loads(install_raw[0]["text"])
                if not install_result["success"]:
                    logger.error("Dependency install failed: %s", install_result["error"])
                    return {"error": f"dependency install failed: {install_result['error']}", "retry_count": retry_count + 1}

        raw = await run_code.ainvoke({"file_path": state.get("file_path", "")})
        try:
            result = json.loads(raw[0]["text"])
        except (IndexError, KeyError, json.JSONDecodeError) as e:
            logger.error("Failed to parse executor result: %s", e)
            return {"error": f"executor failed to parse result: {e}", "retry_count": retry_count + 1}

        if result["success"]:
            logger.info("Execution succeeded")
            return {"output": result["output"], "error": "", "success": True}
        logger.warning("Execution failed | attempt=%d | error=%r", retry_count + 1, result["error"][:120])
        return {"error": result["error"], "retry_count": retry_count + 1}

    return exec_agent

def _make_plan_review_node(tools):
    async def plan_review(state: State):
        decision = interrupt({
            "task": state.get("task", ""),
            "workspace": state.get("workspace", ""),
            "steps": state.get("steps", ""),
            "files": state.get("files", []),
            "entry_point": state.get("file_path", ""),
            "dependencies": state.get("dependencies", []),
            "message": "Review the plan. Reply with action=approve to proceed, or action=reject with feedback to revise.",
        })

        action = decision.get("action", "approve")
        feedback = decision.get("feedback", "").strip()

        # Feedback flows back to the planner as a user message so it can revise
        # the full plan (steps, files, entry_point, dependencies) itself rather
        # than the human hand-editing structured fields.
        if action == "reject" and feedback:
            return {
                "plan_decision": action,
                "messages": [HumanMessage(content=f"The previous plan was rejected. Revise it based on this feedback:\n{feedback}")],
            }
        return {"plan_decision": action}
    return plan_review