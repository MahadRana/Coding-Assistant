import { useMemo, useState } from "react";

interface Props {
  output: string;
  task?: string | null;
  onCopied?: () => void;
}

export function OutputDisplay({ output, task, onCopied }: Props) {
  const [copied, setCopied] = useState(false);
  const [wrap, setWrap] = useState(true);
  const [showLineNumbers, setShowLineNumbers] = useState(true);

  const text = output || "(no output)";

  const stats = useMemo(() => {
    const lines = text.split("\n");
    return {
      lines: lines.length,
      chars: text.length,
    };
  }, [text]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      onCopied?.();
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — silently ignore */
    }
  }

  function download() {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `output-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <section className="glass animate-slide-up overflow-hidden rounded-2xl border border-emerald-500/30 shadow-xl shadow-black/30">
      <header className="flex items-center justify-between border-b border-emerald-500/20 bg-emerald-500/[0.04] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
          <h2 className="text-sm font-semibold tracking-wide text-emerald-200">
            Output
          </h2>
          <span className="font-mono text-[10px] text-emerald-200/50">
            {stats.lines} lines · {stats.chars} chars
          </span>
        </div>
        <div className="flex items-center gap-1">
          <ToolbarToggle
            active={wrap}
            onClick={() => setWrap((v) => !v)}
            title="Word wrap"
          >
            wrap
          </ToolbarToggle>
          <ToolbarToggle
            active={showLineNumbers}
            onClick={() => setShowLineNumbers((v) => !v)}
            title="Line numbers"
          >
            #
          </ToolbarToggle>
          <ToolbarButton onClick={download} title="Download .txt">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </ToolbarButton>
          <ToolbarButton onClick={copy} title="Copy output">
            {copied ? (
              <span className="font-mono text-[10px] text-emerald-300">
                copied
              </span>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </ToolbarButton>
        </div>
      </header>

      {task && (
        <div className="border-b border-zinc-800/80 bg-black/20 px-4 py-2">
          <span className="font-mono text-[10px] tracking-wide text-zinc-500 uppercase">
            task
          </span>
          <p className="mt-0.5 text-sm text-zinc-300">{task}</p>
        </div>
      )}

      <CodeBlock
        text={text}
        wrap={wrap}
        showLineNumbers={showLineNumbers}
      />
    </section>
  );
}

function CodeBlock({
  text,
  wrap,
  showLineNumbers,
}: {
  text: string;
  wrap: boolean;
  showLineNumbers: boolean;
}) {
  const lines = useMemo(() => text.split("\n"), [text]);

  return (
    <div className="max-h-[480px] overflow-auto bg-black/40 font-mono text-[12.5px] leading-relaxed">
      <div className="flex">
        {showLineNumbers && (
          <pre
            aria-hidden
            className="sticky left-0 z-10 shrink-0 select-none bg-black/40 px-3 py-3 text-right text-zinc-600"
          >
            {lines.map((_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </pre>
        )}
        <pre
          className={`flex-1 px-3 py-3 text-zinc-100 ${
            wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"
          }`}
        >
          {text}
        </pre>
      </div>
    </div>
  );
}

function ToolbarButton({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="rounded-md border border-zinc-700/80 bg-zinc-900/60 px-2 py-1 text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200"
    >
      {children}
    </button>
  );
}

function ToolbarToggle({
  active,
  children,
  title,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`rounded-md border px-2 py-1 font-mono text-[10px] transition ${
        active
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
          : "border-zinc-700/80 bg-zinc-900/60 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
      }`}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}
