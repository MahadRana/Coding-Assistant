export type AgentStatus =
  | "idle"
  | "planning"
  | "awaiting_review"
  | "building"
  | "done"
  | "error";

export interface Plan {
  steps: string;
  files: string[];
  dependencies: string[];
  message: string;
}

export interface RunRequest {
  task: string;
  thread_id: string;
}

export type ReviewAction = "approve" | "reject" | "feedback";

export interface ResumeRequest {
  thread_id: string;
  action: ReviewAction;
  feedback?: string;
}

export type AgentResponse =
  | { status: "done"; output: string }
  | {
      status: "awaiting_review";
      thread_id: string;
      interrupt: Plan;
    };
