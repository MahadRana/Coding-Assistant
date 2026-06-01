import type { AgentStatus } from "../types";

interface Props {
  status: AgentStatus;
}

const STAGES: { key: string; label: string; matches: AgentStatus[] }[] = [
  { key: "plan", label: "Plan", matches: ["planning"] },
  { key: "review", label: "Review", matches: ["awaiting_review"] },
  { key: "build", label: "Build & Run", matches: ["building"] },
  { key: "done", label: "Done", matches: ["done"] },
];

function stageState(
  stage: (typeof STAGES)[number],
  status: AgentStatus
): "pending" | "active" | "complete" {
  if (status === "error") return "pending";
  const currentIndex = STAGES.findIndex((s) => s.matches.includes(status));
  const ownIndex = STAGES.findIndex((s) => s.key === stage.key);
  if (currentIndex === -1) return "pending";
  if (ownIndex < currentIndex) return "complete";
  if (ownIndex === currentIndex) return "active";
  return "pending";
}

export function Timeline({ status }: Props) {
  if (status === "idle") return null;

  return (
    <div className="animate-fade-in rounded-xl border border-zinc-800/80 bg-zinc-900/30 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        {STAGES.map((stage, i) => {
          const state = stageState(stage, status);
          return (
            <div key={stage.key} className="flex flex-1 items-center gap-2">
              <StageNode state={state} index={i + 1} />
              <span
                className={`text-xs font-medium whitespace-nowrap ${
                  state === "active"
                    ? "text-sky-200"
                    : state === "complete"
                      ? "text-emerald-300"
                      : "text-zinc-500"
                }`}
              >
                {stage.label}
              </span>
              {i < STAGES.length - 1 && (
                <Connector
                  filled={state === "complete"}
                  active={state === "active"}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StageNode({
  state,
  index,
}: {
  state: "pending" | "active" | "complete";
  index: number;
}) {
  if (state === "complete") {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="relative flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/20 text-sky-200 ring-1 ring-sky-500/50">
        <span className="absolute inset-0 animate-ping rounded-full bg-sky-500/30" />
        <span className="relative font-mono text-[10px] font-semibold">
          {index}
        </span>
      </span>
    );
  }
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800/60 font-mono text-[10px] font-semibold text-zinc-500 ring-1 ring-zinc-700/60">
      {index}
    </span>
  );
}

function Connector({
  filled,
  active,
}: {
  filled: boolean;
  active: boolean;
}) {
  return (
    <div className="relative h-px flex-1 overflow-hidden bg-zinc-800">
      <div
        className={`h-px transition-all ${
          filled
            ? "w-full bg-emerald-500/60"
            : active
              ? "w-1/2 bg-sky-500/60"
              : "w-0"
        }`}
      />
    </div>
  );
}
