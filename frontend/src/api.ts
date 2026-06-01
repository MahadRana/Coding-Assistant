import axios, { AxiosError } from "axios";
import type {
  AgentResponse,
  ResumeRequest,
  ReviewAction,
  RunRequest,
} from "./types";

const baseURL = import.meta.env.VITE_API_BASE ?? "";

const client = axios.create({
  baseURL,
  timeout: 300_000,
  headers: { "Content-Type": "application/json" },
});

export class ApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "ApiError";
  }
}

function toApiError(err: unknown): ApiError {
  if (err instanceof AxiosError) {
    const detail =
      (err.response?.data as { detail?: string } | undefined)?.detail ??
      err.message;
    return new ApiError(detail, err.response?.status);
  }
  return new ApiError(err instanceof Error ? err.message : "Unknown error");
}

export async function runTask(req: RunRequest): Promise<AgentResponse> {
  try {
    const { data } = await client.post<AgentResponse>("/run", req);
    return data;
  } catch (err) {
    throw toApiError(err);
  }
}

export async function resumeTask(
  threadId: string,
  action: ReviewAction,
  feedback?: string
): Promise<AgentResponse> {
  const body: ResumeRequest = { thread_id: threadId, action };
  if (action === "feedback") {
    body.feedback = feedback ?? "";
  }
  try {
    const { data } = await client.post<AgentResponse>("/resume", body);
    return data;
  } catch (err) {
    throw toApiError(err);
  }
}
