interface Props {
  onPick: (task: string) => void;
}

const EXAMPLES: { title: string; prompt: string; tag: string }[] = [
  {
    title: "Bitcoin price tracker",
    tag: "API",
    prompt:
      "Write a script that fetches the latest Bitcoin price from a public API and prints it with a timestamp.",
  },
  {
    title: "CSV → JSON converter",
    tag: "Files",
    prompt:
      "Create a CLI that takes a CSV file path and writes the equivalent JSON to stdout. Include simple type inference for numbers and booleans.",
  },
  {
    title: "Markdown table of contents",
    tag: "Parsing",
    prompt:
      "Given a markdown file, generate a nested table of contents from the heading hierarchy and insert it after the first H1.",
  },
  {
    title: "Web scraper to JSONL",
    tag: "Scraping",
    prompt:
      "Scrape the titles and points of the front page of Hacker News and save each entry as one JSON object per line.",
  },
];

export function Hero({ onPick }: Props) {
  return (
    <div className="animate-fade-in space-y-6">
      <div className="space-y-3">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 font-mono text-[10px] tracking-wider text-sky-300 uppercase">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" />
          Ready
        </span>
        <h1 className="text-gradient text-3xl font-semibold tracking-tight sm:text-4xl">
          Describe what you want built.
        </h1>
        <p className="max-w-xl text-sm text-zinc-400">
          The planner drafts steps, you review them, and the coder writes &amp; runs the program.
          Plans can be approved, rejected, or revised with feedback.
        </p>
      </div>

      <div>
        <p className="mb-2 font-mono text-[10px] tracking-wider text-zinc-500 uppercase">
          Try an example
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.title}
              type="button"
              onClick={() => onPick(ex.prompt)}
              className="group rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-left transition hover:border-sky-500/40 hover:bg-zinc-900/70"
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="rounded-full border border-zinc-700/80 bg-zinc-800/70 px-1.5 py-0.5 font-mono text-[9px] tracking-wider text-zinc-400 uppercase">
                  {ex.tag}
                </span>
                <span className="text-sm font-medium text-zinc-100 transition group-hover:text-sky-200">
                  {ex.title}
                </span>
              </div>
              <p className="line-clamp-2 text-xs text-zinc-500">{ex.prompt}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
