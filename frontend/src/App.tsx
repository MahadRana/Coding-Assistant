import { useCallback, useEffect, useRef, useState } from "react";
import { useAgent } from "./hooks/useAgent";
import { useHistory } from "./hooks/useHistory";
import { useToast } from "./hooks/useToast";
import { TaskInput, type TaskInputHandle } from "./components/TaskInput";
import { PlanReviewer } from "./components/PlanReviewer";
import { OutputDisplay } from "./components/OutputDisplay";
import { StatusIndicator } from "./components/StatusIndicator";
import { Sidebar } from "./components/Sidebar";
import { Timeline } from "./components/Timeline";
import { Hero } from "./components/Hero";
import { Toaster } from "./components/Toaster";
import { WorkingPanel } from "./components/WorkingPanel";
import { ShortcutsModal } from "./components/ShortcutsModal";
import type { HistoryItem } from "./hooks/useHistory";
import type { ReviewAction } from "./types";

const SIDEBAR_KEY = "ca:sidebar:collapsed";

export default function App() {
  const {
    status,
    threadId,
    task,
    plan,
    output,
    error,
    submitTask,
    respondToPlan,
    reset,
    loadFromHistory,
  } = useAgent();

  const history = useHistory();
  const { toasts, show, dismiss } = useToast();

  const taskInputRef = useRef<TaskInputHandle>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Persist history every time a task completes or errors.
  useEffect(() => {
    if (!threadId || !task) return;
    if (status === "done") {
      history.upsert({
        id: threadId,
        task,
        status: "done",
        createdAt: Date.now(),
        output: output ?? "",
      });
    } else if (status === "error") {
      history.upsert({
        id: threadId,
        task,
        status: "error",
        createdAt: Date.now(),
        error: error ?? "",
      });
    }
    // history is intentionally excluded — its identity is stable across renders
    // and including it would create a write loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, threadId, task, output, error]);

  // Persist sidebar collapsed preference
  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, sidebarCollapsed ? "1" : "0");
    } catch {
      /* ignore quota errors */
    }
  }, [sidebarCollapsed]);

  // Surface errors via toast (in addition to the inline error panel)
  const lastErrorRef = useRef<string | null>(null);
  useEffect(() => {
    if (status === "error" && error && error !== lastErrorRef.current) {
      lastErrorRef.current = error;
      show(error, "error", 5000);
    }
    if (status !== "error") {
      lastErrorRef.current = null;
    }
  }, [status, error, show]);

  // Global keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inField =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        taskInputRef.current?.focus();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        handleNew();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setSidebarCollapsed((v) => !v);
        return;
      }
      if (!inField && e.key === "?") {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if (e.key === "Escape") {
        if (shortcutsOpen) {
          setShortcutsOpen(false);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // handleNew is recreated below; capturing it directly keeps wiring simple.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortcutsOpen]);

  const handleNew = useCallback(() => {
    reset();
    requestAnimationFrame(() => taskInputRef.current?.focus());
  }, [reset]);

  const handleSelectHistory = useCallback(
    (item: HistoryItem) => {
      loadFromHistory(item);
    },
    [loadFromHistory]
  );

  const handlePickExample = useCallback((prompt: string) => {
    taskInputRef.current?.setValue(prompt);
  }, []);

  const handleRespond = useCallback(
    (action: ReviewAction, feedback?: string) => {
      respondToPlan(action, feedback);
      if (action === "approve") show("Plan approved — building", "info");
      else if (action === "reject") show("Plan rejected — replanning", "info");
      else show("Feedback sent to planner", "info");
    },
    [respondToPlan, show]
  );

  const isBusy = status === "planning" || status === "building";
  const showInput = status === "idle" || status === "done" || status === "error";

  return (
    <div className="flex min-h-screen bg-transparent text-zinc-100">
      <Sidebar
        items={history.items}
        activeId={threadId}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        onNew={handleNew}
        onSelect={handleSelectHistory}
        onDelete={(id) => {
          history.remove(id);
          if (id === threadId) reset();
        }}
        onClear={() => {
          history.clear();
          show("History cleared", "info");
        }}
      />

      <main className="min-w-0 flex-1">
        <div className="mx-auto flex min-h-screen max-w-4xl flex-col px-4 py-6 sm:px-8 sm:py-10">
          <TopBar
            status={status}
            threadId={threadId}
            onNew={handleNew}
            onShowShortcuts={() => setShortcutsOpen(true)}
          />

          <Timeline status={status} />

          <div className="mt-6 flex-1 space-y-6">
            {status === "idle" && <Hero onPick={handlePickExample} />}

            {showInput && (
              <TaskInput
                ref={taskInputRef}
                disabled={isBusy}
                onSubmit={submitTask}
              />
            )}

            {isBusy && <WorkingPanel status={status} />}

            {status === "awaiting_review" && plan && (
              <PlanReviewer
                plan={plan}
                disabled={false}
                onRespond={handleRespond}
              />
            )}

            {status === "done" && output !== null && (
              <OutputDisplay
                output={output}
                task={task}
                onCopied={() => show("Copied to clipboard", "success", 1400)}
              />
            )}

            {status === "error" && error && (
              <ErrorPanel
                message={error}
                onDismiss={reset}
                onRetry={task ? () => submitTask(task) : undefined}
              />
            )}
          </div>

          <Footer threadId={threadId} onShowShortcuts={() => setShortcutsOpen(true)} />
        </div>
      </main>

      <Toaster toasts={toasts} onDismiss={dismiss} />
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}

function TopBar({
  status,
  threadId,
  onNew,
  onShowShortcuts,
}: {
  status: ReturnType<typeof useAgent>["status"];
  threadId: string | null;
  onNew: () => void;
  onShowShortcuts: () => void;
}) {
  return (
    <header className="flex items-center justify-between gap-3">
      <div className="md:hidden">
        <Logo />
      </div>
      <div className="hidden md:block">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
          Workspace
        </h1>
        <p className="font-mono text-[11px] text-zinc-500">
          thread: {threadId ? threadId.slice(0, 8) : "—"}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <StatusIndicator status={status} />
        <button
          type="button"
          onClick={onShowShortcuts}
          title="Keyboard shortcuts (?)"
          className="hidden rounded-md border border-zinc-800 bg-zinc-900/40 px-2 py-1 font-mono text-[11px] text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200 sm:inline-flex"
        >
          ?
        </button>
        <button
          type="button"
          onClick={onNew}
          className="rounded-md border border-zinc-800 bg-zinc-900/40 px-2.5 py-1 text-xs font-medium text-zinc-300 transition hover:border-sky-500/40 hover:text-sky-200"
        >
          New task
        </button>
      </div>
    </header>
  );
}

function Footer({
  threadId,
  onShowShortcuts,
}: {
  threadId: string | null;
  onShowShortcuts: () => void;
}) {
  return (
    <footer className="mt-8 flex items-center justify-between border-t border-zinc-900 pt-4 font-mono text-[11px] text-zinc-600">
      <span>
        thread:{" "}
        <span className="text-zinc-500">
          {threadId ? threadId.slice(0, 8) : "—"}
        </span>
      </span>
      <button
        type="button"
        onClick={onShowShortcuts}
        className="rounded text-zinc-500 transition hover:text-zinc-300"
      >
        keyboard shortcuts
      </button>
    </footer>
  );
}

function Logo() {
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-800 bg-gradient-to-br from-sky-500/20 to-violet-500/20 font-mono text-sm font-bold text-sky-300">
      &gt;_
    </div>
  );
}

function ErrorPanel({
  message,
  onDismiss,
  onRetry,
}: {
  message: string;
  onDismiss: () => void;
  onRetry?: () => void;
}) {
  return (
    <div className="glass animate-slide-up overflow-hidden rounded-2xl border border-rose-500/40 shadow-xl shadow-black/30">
      <div className="flex items-center justify-between border-b border-rose-500/20 bg-rose-500/[0.05] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-rose-500" />
          <h2 className="text-sm font-semibold text-rose-200">
            Request failed
          </h2>
        </div>
        <div className="flex items-center gap-1">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 font-mono text-[11px] text-rose-200 transition hover:bg-rose-500/20"
            >
              retry
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            className="rounded font-mono text-[11px] text-rose-300/80 transition hover:text-rose-200"
          >
            dismiss
          </button>
        </div>
      </div>
      <pre className="overflow-x-auto px-4 py-3 font-mono text-[13px] whitespace-pre-wrap text-rose-100">
        {message}
      </pre>
    </div>
  );
}
