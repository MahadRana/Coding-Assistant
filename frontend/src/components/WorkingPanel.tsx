import { useEffect, useState } from "react";

interface Props {
  status: "planning" | "building";
}

const COPY: Record<
  Props["status"],
  { headline: string; sub: string; tip: string; accent: string }
> = {
  planning: {
    headline: "Drafting a plan",
    sub: "The planner is breaking the task into steps, choosing files, and picking dependencies.",
    tip: "If the task is unfamiliar, the planner may run a web search first.",
    accent: "sky",
  },
  building: {
    headline: "Coding & executing",
    sub: "The coder is writing files to the workspace and running the entry point.",
    tip: "If execution fails, the debugger will iterate up to 3 times before giving up.",
    accent: "violet",
  },
};

export function WorkingPanel({ status }: Props) {
  const meta = COPY[status];
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(0);
    const start = Date.now();
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [status]);

  const ring =
    meta.accent === "sky" ? "border-t-sky-400" : "border-t-violet-400";
  const dot =
    meta.accent === "sky" ? "bg-sky-400/80" : "bg-violet-400/80";
  const text =
    meta.accent === "sky" ? "text-sky-200" : "text-violet-200";

  return (
    <div className="glass animate-slide-up overflow-hidden rounded-2xl border border-zinc-800 shadow-xl shadow-black/30">
      <div className="flex items-start gap-4 px-4 py-4">
        <span
          aria-hidden
          className={`inline-block h-7 w-7 shrink-0 animate-spin rounded-full border-2 border-zinc-800 ${ring}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className={`text-base font-semibold ${text}`}>
              {meta.headline}
            </h3>
            <span className="font-mono text-[11px] text-zinc-500">
              {formatElapsed(elapsed)}
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-400">{meta.sub}</p>
          <p className="mt-2 flex items-center gap-2 font-mono text-[11px] text-zinc-500">
            <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
            {meta.tip}
          </p>
        </div>
      </div>
      <div className="h-1 w-full overflow-hidden bg-zinc-900">
        <div className="shimmer h-full w-full" />
      </div>
    </div>
  );
}

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}
