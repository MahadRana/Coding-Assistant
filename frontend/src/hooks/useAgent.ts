import { useCallback, useRef, useState } from "react";
import { runTask, resumeTask } from "../api";
import type { AgentResponse, AgentStatus, Plan, ReviewAction } from "../types";

interface AgentState {
  status: AgentStatus;
  threadId: string | null;
  task: string | null;
  plan: Plan | null;
  output: string | null;
  error: string | null;
}

const INITIAL: AgentState = {
  status: "idle",
  threadId: null,
  task: null,
  plan: null,
  output: null,
  error: null,
};

function applyResponse(
  prev: AgentState,
  res: AgentResponse,
  fallbackThreadId: string
): AgentState {
  if (res.status === "awaiting_review") {
    return {
      ...prev,
      status: "awaiting_review",
      threadId: res.thread_id,
      plan: res.interrupt,
      output: null,
      error: null,
    };
  }
  return {
    ...prev,
    status: "done",
    threadId: prev.threadId ?? fallbackThreadId,
    plan: null,
    output: res.output,
    error: null,
  };
}

/**
 * State machine for the agent: idle → planning → awaiting_review → building → done.
 * A reject/feedback response loops awaiting_review → planning → awaiting_review.
 * Errors surface via `status: "error"` without losing the thread id, so the user
 * can retry by submitting the task again.
 */
export function useAgent() {
  const [state, setState] = useState<AgentState>(INITIAL);
  const threadIdRef = useRef<string | null>(null);
  const inFlight = useRef(false);

  const submitTask = useCallback(async (task: string) => {
    if (inFlight.current) return;
    const trimmed = task.trim();
    if (!trimmed) return;

    inFlight.current = true;
    const threadId = crypto.randomUUID();
    threadIdRef.current = threadId;
    setState({
      status: "planning",
      threadId,
      task: trimmed,
      plan: null,
      output: null,
      error: null,
    });

    try {
      const res = await runTask({ task: trimmed, thread_id: threadId });
      setState((prev) => applyResponse(prev, res, threadId));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        status: "error",
        error: err instanceof Error ? err.message : "Request failed",
      }));
    } finally {
      inFlight.current = false;
    }
  }, []);

  const respondToPlan = useCallback(
    async (action: ReviewAction, feedback?: string) => {
      const threadId = threadIdRef.current;
      if (!threadId || inFlight.current) return;

      inFlight.current = true;
      // Approving moves us into build/run; reject and feedback loop the planner.
      const nextStatus: AgentStatus =
        action === "approve" ? "building" : "planning";

      setState((prev) => ({
        ...prev,
        status: nextStatus,
        plan: null,
        error: null,
      }));

      try {
        const res = await resumeTask(threadId, action, feedback);
        setState((prev) => applyResponse(prev, res, threadId));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          status: "error",
          error: err instanceof Error ? err.message : "Request failed",
        }));
      } finally {
        inFlight.current = false;
      }
    },
    []
  );

  const reset = useCallback(() => {
    threadIdRef.current = null;
    setState(INITIAL);
  }, []);

  // Load a completed (or failed) item from history into the view without
  // re-running the agent. The thread id is restored so subsequent retries
  // surface in the same conversation.
  const loadFromHistory = useCallback(
    (item: {
      id: string;
      task: string;
      status: "done" | "error" | "in_progress";
      output?: string;
      error?: string;
    }) => {
      if (inFlight.current) return;
      threadIdRef.current = item.id;
      setState({
        status:
          item.status === "in_progress"
            ? "idle"
            : item.status === "error"
              ? "error"
              : "done",
        threadId: item.id,
        task: item.task,
        plan: null,
        output: item.output ?? null,
        error: item.error ?? null,
      });
    },
    []
  );

  return {
    status: state.status,
    threadId: state.threadId,
    task: state.task,
    plan: state.plan,
    output: state.output,
    error: state.error,
    submitTask,
    respondToPlan,
    reset,
    loadFromHistory,
  };
}
