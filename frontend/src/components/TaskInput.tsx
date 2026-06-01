import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

export interface TaskInputHandle {
  focus: () => void;
  setValue: (v: string) => void;
}

interface Props {
  disabled: boolean;
  onSubmit: (task: string) => void;
}

const PLACEHOLDER =
  "Describe what you want built. e.g. Write a script that fetches the latest Bitcoin price and prints it.";

const MAX = 2000;

export const TaskInput = forwardRef<TaskInputHandle, Props>(
  function TaskInput({ disabled, onSubmit }, ref) {
    const [value, setValue] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
      setValue: (v: string) => {
        setValue(v);
        // wait for the textarea to mount then focus + place cursor at end
        requestAnimationFrame(() => {
          const el = textareaRef.current;
          if (el) {
            el.focus();
            el.setSelectionRange(v.length, v.length);
          }
        });
      },
    }));

    // Auto-grow the textarea up to a reasonable max.
    useEffect(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 260) + "px";
    }, [value]);

    function handleSubmit(e?: FormEvent) {
      e?.preventDefault();
      if (disabled) return;
      const trimmed = value.trim();
      if (!trimmed) return;
      onSubmit(trimmed);
      setValue("");
    }

    function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        handleSubmit();
      }
    }

    const charCount = value.length;
    const over = charCount > MAX;

    return (
      <form
        onSubmit={handleSubmit}
        className="glass animate-slide-up overflow-hidden rounded-2xl border border-zinc-800 shadow-xl shadow-black/30 transition focus-within:border-sky-500/40 focus-within:shadow-sky-500/5"
      >
        <div className="flex items-center justify-between border-b border-zinc-800/80 px-4 py-2.5">
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-zinc-200">
            <span className="flex h-5 w-5 items-center justify-center rounded bg-sky-500/20 text-[10px] text-sky-300">
              ▸
            </span>
            New task
          </h2>
          <span className="hidden font-mono text-[11px] text-zinc-500 sm:inline">
            <kbd className="rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-[10px]">⌘</kbd>
            <span className="mx-1">+</span>
            <kbd className="rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-[10px]">Enter</kbd>
            <span className="ml-1.5">to submit</span>
          </span>
        </div>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKey}
          placeholder={PLACEHOLDER}
          disabled={disabled}
          rows={4}
          spellCheck={false}
          className="block w-full resize-none bg-transparent px-4 py-3 text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:outline-none disabled:opacity-50"
        />

        <div className="flex items-center justify-between border-t border-zinc-800/80 bg-black/20 px-4 py-2.5">
          <span
            className={`font-mono text-[11px] ${
              over ? "text-rose-400" : "text-zinc-500"
            }`}
          >
            {charCount}/{MAX}
          </span>
          <div className="flex items-center gap-2">
            {value.trim() && (
              <button
                type="button"
                onClick={() => setValue("")}
                disabled={disabled}
                className="rounded-md px-2 py-1 text-xs text-zinc-500 transition hover:text-zinc-200 disabled:opacity-50"
              >
                clear
              </button>
            )}
            <button
              type="submit"
              disabled={disabled || !value.trim() || over}
              className="group inline-flex items-center gap-2 rounded-md bg-gradient-to-br from-sky-400 to-sky-500 px-3.5 py-1.5 text-sm font-medium text-zinc-950 shadow-md shadow-sky-500/20 transition hover:from-sky-300 hover:to-sky-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60 disabled:cursor-not-allowed disabled:from-zinc-800 disabled:to-zinc-800 disabled:text-zinc-500 disabled:shadow-none"
            >
              Run task
              <span
                aria-hidden
                className="inline-block text-base leading-none transition group-hover:translate-x-0.5"
              >
                →
              </span>
            </button>
          </div>
        </div>
      </form>
    );
  }
);
