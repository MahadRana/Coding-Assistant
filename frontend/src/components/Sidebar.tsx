import { useMemo, useState } from "react";
import type { HistoryItem } from "../hooks/useHistory";

interface Props {
  items: HistoryItem[];
  activeId: string | null;
  collapsed: boolean;
  onToggle: () => void;
  onNew: () => void;
  onSelect: (item: HistoryItem) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}

export function Sidebar({
  items,
  activeId,
  collapsed,
  onToggle,
  onNew,
  onSelect,
  onDelete,
  onClear,
}: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => it.task.toLowerCase().includes(q));
  }, [items, query]);

  if (collapsed) {
    return (
      <aside className="hidden w-14 shrink-0 flex-col items-center gap-3 border-r border-zinc-900/80 bg-zinc-950/40 py-4 md:flex">
        <button
          type="button"
          onClick={onToggle}
          title="Expand sidebar"
          className="rounded-md p-2 text-zinc-500 transition hover:bg-zinc-900 hover:text-zinc-200"
        >
          <IconPanelRight />
        </button>
        <button
          type="button"
          onClick={onNew}
          title="New task"
          className="rounded-md p-2 text-zinc-400 transition hover:bg-zinc-900 hover:text-sky-300"
        >
          <IconPlus />
        </button>
      </aside>
    );
  }

  return (
    <aside className="hidden w-72 shrink-0 flex-col border-r border-zinc-900/80 bg-zinc-950/40 md:flex">
      <div className="flex items-center justify-between px-3 py-3">
        <div className="flex items-center gap-2">
          <Logo />
          <div className="leading-tight">
            <div className="text-sm font-semibold text-zinc-100">
              Coding Assistant
            </div>
            <div className="font-mono text-[10px] text-zinc-500">
              plan · review · run
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggle}
          title="Collapse sidebar"
          className="rounded-md p-1.5 text-zinc-500 transition hover:bg-zinc-900 hover:text-zinc-200"
        >
          <IconPanelLeft />
        </button>
      </div>

      <div className="px-3 pb-2">
        <button
          type="button"
          onClick={onNew}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm font-medium text-zinc-200 transition hover:border-sky-500/40 hover:bg-zinc-900 hover:text-sky-200"
        >
          <IconPlus />
          New task
          <kbd className="ml-auto rounded border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
            ⌘N
          </kbd>
        </button>
      </div>

      <div className="px-3 pb-2">
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-zinc-600">
            <IconSearch />
          </span>
          <input
            type="text"
            placeholder="Search history…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-md border border-zinc-800 bg-zinc-900/50 py-1.5 pl-8 pr-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-sky-500/40 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex items-center justify-between px-3 py-1">
        <span className="font-mono text-[10px] tracking-wide text-zinc-500 uppercase">
          History · {items.length}
        </span>
        {items.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="font-mono text-[10px] text-zinc-500 hover:text-rose-300"
          >
            clear all
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {filtered.length === 0 ? (
          <div className="px-3 py-8 text-center font-mono text-[11px] text-zinc-600">
            {items.length === 0 ? "no tasks yet" : "no matches"}
          </div>
        ) : (
          <ul className="space-y-1">
            {filtered.map((item) => (
              <li key={item.id}>
                <HistoryRow
                  item={item}
                  active={item.id === activeId}
                  onClick={() => onSelect(item)}
                  onDelete={() => onDelete(item.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-zinc-900/80 px-3 py-2 font-mono text-[10px] text-zinc-600">
        <div className="flex items-center justify-between">
          <span>claude · langgraph</span>
          <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
            online
          </span>
        </div>
      </div>
    </aside>
  );
}

function HistoryRow({
  item,
  active,
  onClick,
  onDelete,
}: {
  item: HistoryItem;
  active: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  const dot =
    item.status === "done"
      ? "bg-emerald-400"
      : item.status === "error"
        ? "bg-rose-400"
        : "bg-sky-400 animate-pulse";

  return (
    <div
      className={`group relative cursor-pointer rounded-md border px-2.5 py-2 transition ${
        active
          ? "border-sky-500/40 bg-sky-500/[0.06]"
          : "border-transparent hover:border-zinc-800 hover:bg-zinc-900/60"
      }`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="flex items-start gap-2">
        <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] text-zinc-200">{item.task}</p>
          <p className="mt-0.5 font-mono text-[10px] text-zinc-500">
            {formatTime(item.createdAt)}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete"
        className="absolute top-1.5 right-1.5 hidden rounded p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-rose-300 group-hover:block"
      >
        <IconX />
      </button>
    </div>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function Logo() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-800 bg-gradient-to-br from-sky-500/20 to-violet-500/20 font-mono text-sm font-bold text-sky-300">
      &gt;_
    </div>
  );
}

/* ---------------------------- Icons ---------------------------- */

function IconPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function IconSearch() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
function IconX() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
function IconPanelLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  );
}
function IconPanelRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="15" y1="3" x2="15" y2="21" />
    </svg>
  );
}
