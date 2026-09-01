import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FilePlus2, Search } from "lucide-react";
import { NAV_GROUPS } from "./nav";
import { cx } from "./ui";

export interface Command {
  label: string;
  hint?: string;
  /** Navigate here… */
  to?: string;
  /** …or run an action in place (e.g. open the site-chat panel). */
  run?: () => void;
}

/** Small dependency-free command palette: filter, ↑/↓, Enter to go, Esc to close. */
export function CommandPalette({
  open,
  onClose,
  extraCommands,
}: {
  open: boolean;
  onClose: () => void;
  extraCommands?: Command[];
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);

  const commands = useMemo<Command[]>(() => {
    const nav = NAV_GROUPS.flatMap((group) =>
      group.items
        .filter((item) => !item.external)
        .map((item) => ({ label: item.label, hint: group.label, to: item.to }))
    );
    return [
      { label: "New post", hint: "Create", to: "/posts/new" },
      { label: "New page", hint: "Create", to: "/pages/new" },
      { label: "Design", hint: "Settings", to: "/settings/design" },
      { label: "Browse templates", hint: "Content", to: "/templates" },
      ...(extraCommands ?? []),
      ...nav,
    ];
    // `extraCommands` is a literal at the call site; depend on its labels, not identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(extraCommands ?? []).map((c) => c.label).join("|")]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q) || (c.hint ?? "").toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
    }
  }, [open]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function run(cmd: Command | undefined) {
    if (!cmd) return;
    onClose();
    if (cmd.run) cmd.run();
    else if (cmd.to) navigate(cmd.to);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-zinc-950/50 p-4 pt-[12vh] backdrop-blur-sm">
      <div className="absolute inset-0" aria-hidden="true" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative w-full max-w-lg overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="flex items-center gap-2 border-b border-zinc-200 px-4 dark:border-zinc-800">
          <Search className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
          <input
            autoFocus
            value={query}
            aria-label="Search commands"
            placeholder="Search pages and actions…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                run(results[index]);
              }
            }}
            className="w-full bg-transparent py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-100"
          />
        </div>
        <ul className="wv-scroll max-h-80 overflow-y-auto p-1.5">
          {results.map((cmd, i) => (
            <li key={(cmd.to ?? "") + cmd.label}>
              <button
                type="button"
                onMouseEnter={() => setIndex(i)}
                onClick={() => run(cmd)}
                className={cx(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm",
                  i === index
                    ? "bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200"
                    : "text-zinc-700 dark:text-zinc-300"
                )}
              >
                <FilePlus2 className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
                <span className="flex-1 truncate">{cmd.label}</span>
                {cmd.hint && <span className="text-xs text-zinc-400">{cmd.hint}</span>}
              </button>
            </li>
          ))}
          {results.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">No matches.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
