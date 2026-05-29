import json
from dotenv import load_dotenv
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage
from langgraph.graph import MessagesState

load_dotenv()

llm = ChatAnthropic(model="claude-sonnet-4-6")


class State(MessagesState):
    task: str = ""
    steps: str = ""
    file_path: str = ""
    error: str = ""
    retry_count: int = 0
    output: str = ""
    success: bool = False


_PLAN_PROMPT = """\
You are a coding planner. Your job is to take the user's task and produce a clear, \
numbered step-by-step plan.

Task: {task}

Rules:
- Each step should be specific and actionable
- Make all decisions and assumptions yourself — the coder should only need to follow the steps
- Include what libraries to use, what functions to create, and what the expected output is
- Format: numbered list, one step per line
- If something is unfamiliar, perform an internet search instead of guessing

Return only the plan, no preamble or explanation."""

_CODER_PROMPT = """\
You are a coder. Take the steps the planner gave and generate efficient code that \
accomplishes the task.

Task: {task}
Steps: {steps}

Rules:
- Code must compile
- Follow the steps exactly — no assumptions or decisions of your own
- Write the final code to ./workspace/solution.py using write_file
- Return only the file path when done, no explanation
- Once write_file succeeds, stop immediately — do not read back or verify the file
- Do not call any other tools after write_file"""

_DEBUGGER_PROMPT = """\
You are a debugger. Fix the issue below so the code runs correctly.

Error: {error}
File: {file_path}

Rules:
- Read the file first using read_file
- Code must compile
- Make the minimal changes needed to fix the error — do not change the overall goal
- Write the corrected code to ./workspace/solution.py using write_file
- Return only the file path when done, no explanation"""


def _make_plan_agent(tools):
    search_web = next(t for t in tools if t.name == "search_web")
    llm_with_search = llm.bind_tools([search_web])

    async def plan_agent(state: State):
        prompt = _PLAN_PROMPT.format(task=state.get("task", ""))
        response = await llm_with_search.ainvoke([HumanMessage(content=prompt)] + state["messages"])
        return {"messages": response, "steps": response.content}

    return plan_agent


def _make_code_agent(tools):
    code_tools = [t for t in tools if t.name in {"read_file", "write_file", "list_files"}]
    llm_with_tools = llm.bind_tools(code_tools)

    async def code_agent(state: State):
        error = state.get("error", "")
        file_path = state.get("file_path", "")

        if error:
            prompt = _DEBUGGER_PROMPT.format(error=error, file_path=file_path)
        else:
            prompt = _CODER_PROMPT.format(
                task=state.get("task", ""),
                steps=state.get("steps", ""),
            )

        response = await llm_with_tools.ainvoke(
            [HumanMessage(content=prompt)] + state["messages"]
        )
        return {"messages": response, "file_path": "./workspace/solution.py"}

    return code_agent


def _make_exec_agent(tools):
    run_code = next(t for t in tools if t.name == "run_code")

    async def exec_agent(state: State):
        raw = await run_code.ainvoke({"file_path": state.get("file_path", "")})
        try:
            result = json.loads(raw[0]["text"])
        except (IndexError, KeyError, json.JSONDecodeError) as e:
            return {"error": f"executor failed to parse result: {e}", "retry_count": state.get("retry_count", 0) + 1}
        retry_count = state.get("retry_count", 0)
        if result["success"]:
            return {"output": result["output"], "error": "", "success": True}
        return {"error": result["error"], "retry_count": retry_count + 1}

    return exec_agent