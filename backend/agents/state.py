from langgraph.graph import MessagesState


class State(MessagesState):
    """Full graph state shared between the planner and executor subgraphs.

    The parent graph holds every field so values produced by the planner
    (steps/files/etc.) survive and flow into the executor. Each subgraph
    below narrows this down to only the fields it actually reads or writes.
    """
    task: str
    workspace: str
    plan_decision: str
    steps: str
    files: list[str]
    file_path: str
    dependencies: list[str]
    error: str
    retry_count: int
    output: str
    success: bool
    deps_installed: bool


class PlannerState(MessagesState):
    """Fields the planner subgraph reads and writes.

    Takes the task/workspace, produces the plan (steps/files/entry point/
    dependencies). plan_decision drives the internal review loop. It never
    sees execution fields like error/retry_count/output/success.
    """
    task: str
    workspace: str
    plan_decision: str
    steps: str
    files: list[str]
    file_path: str
    dependencies: list[str]


class ExecutorState(MessagesState):
    """Fields the executor subgraph reads and writes.

    Consumes the plan and runs it, tracking error/retry_count and the final
    output/success. It never sees the planner's internal plan_decision.
    """
    task: str
    workspace: str
    steps: str
    files: list[str]
    file_path: str
    dependencies: list[str]
    error: str
    retry_count: int
    output: str
    success: bool
    deps_installed: bool
