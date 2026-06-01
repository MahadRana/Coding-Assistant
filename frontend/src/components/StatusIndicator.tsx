import type { AgentStatus } from "../types";

interface Props {
  status: AgentStatus;
}

interface StatusMeta {
  label: string;
  dot: string;
  ring: string;
  text: string;
  pulse: boolean;
}

const META: Record<AgentStatus, StatusMeta> = {
  idle: {
    label: "Idle",
    dot: "bg-zinc-500",
    ring: "ring-zinc-700/60",
    text: "text-zinc-400",
    pulse: false,
  },
  planning: {
    label: "Planning",
    dot: "bg-sky-400",
    ring: "ring-sky-500/30",
    text: "text-sky-300",
    pulse: true,
  },
  awaiting_review: {
    label: "Awaiting Review",
    dot: "bg-amber-400",
    ring: "ring-amber-500/30",
    text: "text-amber-300",
    pulse: true,
  },
  building: {
    label: "Coding · Executing",
    dot: "bg-violet-400",
    ring: "ring-violet-500/30",
    text: "text-violet-300",
    pulse: true,
  },
  done: {
    label: "Done",
    dot: "bg-emerald-400",
    ring: "ring-emerald-500/30",
    text: "text-emerald-300",
    pulse: false,
  },
  error: {
    label: "Error",
    dot: "bg-rose-500",
    ring: "ring-rose-500/30",
    text: "text-rose-300",
    pulse: false,
  },
};

export function StatusIndicator({ status }: Props) {
  const meta = META[status];

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full bg-zinc-900/60 px-3 py-1 text-xs font-medium ring-1 ${meta.ring} ${meta.text}`}
      role="status"
      aria-live="polite"
    >
      <span className="relative flex h-2 w-2">
        {meta.pulse && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${meta.dot}`}
          />
        )}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${meta.dot}`}
        />
      </span>
      <span className="tracking-wide uppercase">{meta.label}</span>
    </div>
  );
}
