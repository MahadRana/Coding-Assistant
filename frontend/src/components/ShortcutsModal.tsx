interface Props {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS: { keys: string[]; desc: string }[] = [
  { keys: ["⌘", "Enter"], desc: "Submit task" },
  { keys: ["⌘", "K"], desc: "Focus task input" },
  { keys: ["⌘", "N"], desc: "Start a new task" },
  { keys: ["⌘", "B"], desc: "Toggle sidebar" },
  { keys: ["A"], desc: "Approve plan (while reviewing)" },
  { keys: ["R"], desc: "Reject plan" },
  { keys: ["F"], desc: "Give feedback on plan" },
  { keys: ["Esc"], desc: "Close dialog / clear" },
  { keys: ["?"], desc: "Show shortcuts" },
];

export function ShortcutsModal({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <div
      className="animate-fade-in fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="animate-slide-up glass w-full max-w-md rounded-xl border border-zinc-800 shadow-2xl shadow-black/60"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <h2 className="text-sm font-semibold tracking-wide text-zinc-200">
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <ul className="divide-y divide-zinc-900 px-1">
          {SHORTCUTS.map((s) => (
            <li
              key={s.desc}
              className="flex items-center justify-between px-3 py-2.5"
            >
              <span className="text-sm text-zinc-300">{s.desc}</span>
              <span className="flex gap-1">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="rounded-md border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[11px] text-zinc-300 shadow-sm"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
