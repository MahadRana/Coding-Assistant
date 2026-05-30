import json
from dotenv import load_dotenv
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage
from langgraph.graph import MessagesState
from datetime import datetime

load_dotenv()

llm = ChatAnthropic(model="claude-sonnet-4-6")


class State(MessagesState):
    task: str = ""
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
Workspace: {workspace}

Rules:
- Extract the file_path from the error
- Read the file first using read_file
- Code must compile
- Make the minimal changes needed to fix the error — do not change the overall goal
- Write the corrected code back to the same file path using write_files
- Call write_files with: {{"{workspace}/broken_file.py": "corrected code here"}}
- Return only the file path when done, no explanation"""


def _make_plan_agent(tools):
    search_web = next(t for t in tools if t.name == "search_web")
    llm_with_search = llm.bind_tools([search_web])

    async def plan_agent(state: State):
        run_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        workspace = f"./workspace/run_{run_id}"
        prompt = _PLAN_PROMPT.format(task=state.get("task", ""), workspace=workspace)
        response = await llm_with_search.ainvoke([HumanMessage(content=prompt)] + state["messages"])
        raw = response.content.strip()
        raw = raw.replace("```json", "").replace("```", "").strip()
        parsed = json.loads(raw)
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
            code_tools = [t for t in tools if t.name in {"read_file", "write_files"}]
            prompt = _DEBUGGER_PROMPT.format(error=error, workspace=workspace)
        else:
            code_tools = [t for t in tools if t.name in {"write_files"}]
            prompt = _CODER_PROMPT.format(
                task=state.get("task", ""),
                steps=state.get("steps", ""),
                files=state.get("files", []),
                workspace=workspace
            )

        llm_with_tools = llm.bind_tools(code_tools)
        response = await llm_with_tools.ainvoke(
            [HumanMessage(content=prompt)] + state["messages"]
        )
        return {"messages": response}

    return code_agent


def _make_exec_agent(tools):
    run_code = next(t for t in tools if t.name == "run_code")
    install_deps = next(t for t in tools if t.name == "install_deps")

    async def exec_agent(state: State):
        retry_count = state.get("retry_count", 0)
        if retry_count >= 3:
            return {"output": "Max Retry Limit Reached"}

        # Install dependencies only on the first attempt
        if retry_count == 0:
            deps = state.get("dependencies", [])
            if deps:
                install_raw = await install_deps.ainvoke({"packages": deps})
                install_result = json.loads(install_raw[0]["text"])
                if not install_result["success"]:
                    return {"error": f"dependency install failed: {install_result['error']}", "retry_count": retry_count + 1}

        raw = await run_code.ainvoke({"file_path": state.get("file_path", "")})
        try:
            result = json.loads(raw[0]["text"])
        except (IndexError, KeyError, json.JSONDecodeError) as e:
            return {"error": f"executor failed to parse result: {e}", "retry_count": retry_count + 1}

        if result["success"]:
            return {"output": result["output"], "error": "", "success": True}
        return {"error": result["error"], "retry_count": retry_count + 1}

    return exec_agent