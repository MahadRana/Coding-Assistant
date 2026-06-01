import { useEffect, useMemo, useState } from "react";
import type { Plan, ReviewAction } from "../types";

interface Props {
  plan: Plan;
  disabled: boolean;
  onRespond: (action: ReviewAction, feedback?: string) => void;
}

type Mode = "buttons" | "feedback";

function parseSteps(raw: string): string[] {
  if (!raw) return [];
  // Steps come back as "1. foo\n2. bar". Split on numbered list markers but tolerate ragged input.
  const lines = raw
    .split(/\r?\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.map((l) => l.replace(/^\d+[.)]\s*/, ""));
}

function fileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    py: "PY",
    ts: "TS",
    tsx: "TS",
    js: "JS",
    jsx: "JS",
    json: "JS",
    md: "MD",
    yaml: "YML",
    yml: "YML",
    toml: "TOM",
    html: "HTM",
    css: "CSS",
    sh: "SH",
    sql: "SQL",
  };
  return map[ext] ?? (ext.slice(0, 3).toUpperCase() || "•");
}

export function PlanReviewer({ plan, disabled, onRespond }: Props) {
  const [mode, setMode] = useState<Mode>("buttons");
  const [feedback, setFeedback] = useState("");

  const steps = useMemo(() => parseSteps(plan.steps), [plan.steps]);

  // Keyboard shortcuts while reviewing
  useEffect(() => {
    if (disabled) return;
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (mode === "feedback") return;
      if (e.key === "a" || e.key === "A") onRespond("approve");
      else if (e.key === "r" || e.key === "R") onRespond("reject");
      else if (e.key === "f" || e.key === "F") setMode("feedback");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, disabled, onRespond]);

  function submitFeedback() {
    const trimmed = feedback.trim();
    if (!trimmed || disabled) return;
    onRespond("feedback", trimmed);
    setFeedback("");
    setMode("buttons");
  }

  return (
    <section className="glass animate-slide-up overflow-hidden rounded-2xl border border-amber-500/30 shadow-xl shadow-black/30">
      <header className="flex items-center justify-between border-b border-amber-500/20 bg-amber-500/[0.04] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400/70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
          </span>
          <h2 className="text-sm font-semibold tracking-wide text-amber-200">
            Plan ready for review
          </h2>
        </div>
        <span className="font-mono text-[11px] text-amber-200/60">
          {steps.length} step{steps.length === 1 ? "" : "s"} ·{" "}
          {plan.files.length} file{plan.files.length === 1 ? "" : "s"}
        </span>
      </header>

      <div className="space-y-5 px-4 py-4">
        {plan.message && (
          <p className="text-sm text-zinc-400">{plan.message}</p>
        )}

        <PlanSection title="Steps">
          {steps.length === 0 ? (
            <EmptyHint>No steps were returned.</EmptyHint>
          ) : (
            <ol className="space-y-1.5">
              {steps.map((step, i) => (
                <li
                  key={i}
                  className="group flex items-start gap-3 rounded-md border border-zinc-800/80 bg-black/30 px-3 py-2 transition hover:border-zinc-700/80 hover:bg-black/40"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-800 font-mono text-[11px] font-semibold text-zinc-400 group-hover:bg-amber-500/20 group-hover:text-amber-200">
                    {i + 1}
                  </span>
                  <span className="text-[13.5px] leading-relaxed text-zinc-200">
                    {step}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </PlanSection>

        <div className="grid gap-4 sm:grid-cols-2">
          <PlanSection title="Files">
            {plan.files.length === 0 ? (
              <EmptyHint>No files declared.</EmptyHint>
            ) : (
              <ul className="space-y-1">
                {plan.files.map((f) => (
                  <li
                    key={f}
                    className="flex items-center gap-2 rounded border border-zinc-800 bg-black/30 px-2 py-1 font-mono text-[12.5px] text-zinc-300"
                    title={f}
                  >
                    <span className="rounded bg-zinc-800/80 px-1.5 py-0.5 font-mono text-[9px] tracking-wider text-zinc-400">
                      {fileIcon(f)}
                    </span>
                    <span className="truncate">{f}</span>
                  </li>
                ))}
              </ul>
            )}
          </PlanSection>

          <PlanSection title="Dependencies">
            {plan.dependencies.length === 0 ? (
              <EmptyHint>Standard library only.</EmptyHint>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {plan.dependencies.map((d) => (
                  <li
                    key={d}
                    className="rounded-full border border-zinc-700 bg-zinc-800/70 px-2.5 py-0.5 font-mono text-xs text-zinc-200"
                  >
                    {d}
                  </li>
                ))}
              </ul>
            )}
          </PlanSection>
        </div>
      </div>

      <footer className="border-t border-zinc-800 bg-black/20 px-4 py-3">
        {mode === "buttons" ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="hidden font-mono text-[11px] text-zinc-500 sm:block">
              <kbd className="rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-[10px]">A</kbd>{" "}
              approve ·{" "}
              <kbd className="rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-[10px]">F</kbd>{" "}
              feedback ·{" "}
              <kbd className="rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-[10px]">R</kbd>{" "}
              reject
            </p>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                disabled={disabled}
                onClick={() => onRespond("reject")}
                className="inline-flex items-center rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-sm font-medium text-rose-200 transition hover:bg-rose-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Reject
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => setMode("feedback")}
                className="inline-flex items-center rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm font-medium text-amber-200 transition hover:bg-amber-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Give feedback
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onRespond("approve")}
                className="inline-flex items-center gap-2 rounded-md bg-gradient-to-br from-emerald-400 to-emerald-500 px-3.5 py-1.5 text-sm font-medium text-zinc-950 shadow-md shadow-emerald-500/20 transition hover:from-emerald-300 hover:to-emerald-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60 disabled:cursor-not-allowed disabled:from-zinc-800 disabled:to-zinc-800 disabled:text-zinc-500 disabled:shadow-none"
              >
                Approve
                <span aria-hidden>✓</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <label
              htmlFor="feedback"
              className="block text-xs font-medium tracking-wide text-zinc-400 uppercase"
            >
              Feedback for the planner
            </label>
            <textarea
              id="feedback"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="What should be changed about the plan? Be specific — this will be sent back to the planner."
              rows={3}
              spellCheck={false}
              autoFocus
              disabled={disabled}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  submitFeedback();
                }
                if (e.key === "Escape") {
                  setMode("buttons");
                  setFeedback("");
                }
              }}
              className="block w-full resize-none rounded-md border border-zinc-800 bg-black/40 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-500/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40 disabled:opacity-50"
            />
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] text-zinc-500">
                <kbd className="rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-[10px]">⌘</kbd>{" "}
                <kbd className="rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-[10px]">Enter</kbd>{" "}
                to send · Esc to cancel
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode("buttons");
                    setFeedback("");
                  }}
                  disabled={disabled}
                  className="rounded-md px-3 py-1.5 text-sm text-zinc-400 transition hover:text-zinc-200 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitFeedback}
                  disabled={disabled || !feedback.trim()}
                  className="rounded-md bg-amber-500 px-3.5 py-1.5 text-sm font-medium text-zinc-950 transition hover:bg-amber-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
                >
                  Send to planner
                </button>
              </div>
            </div>
          </div>
        )}
      </footer>
    </section>
  );
}

function PlanSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
        {title}
      </h3>
      {children}
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded border border-dashed border-zinc-800 bg-black/20 px-2 py-1.5 font-mono text-xs text-zinc-500">
      {children}
    </p>
  );
}
