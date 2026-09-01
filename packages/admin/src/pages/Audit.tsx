import { useState } from "react";
import type { AuditEntry } from "@agentpress/sdk";
import { useToolQuery } from "../api";
import { relativeTime } from "../lib/time";
import { ActorBadge, Button, Card, ChannelBadge, ErrorBanner, Input, Spinner, errorMessage } from "../components/ui";

function AuditRow({ entry, expanded, onToggle }: { entry: AuditEntry; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
        <td className="px-4 py-2">
          <ActorBadge kind={entry.actorKind} />
        </td>
        <td className="px-4 py-2">
          <ChannelBadge channel={entry.channel} />
        </td>
        <td className="px-4 py-2 font-mono text-xs">{entry.tool}</td>
        <td className="px-4 py-2">
          <span className={entry.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
            {entry.ok ? "ok" : "error"}
          </span>
        </td>
        <td className="px-4 py-2 text-zinc-500 dark:text-zinc-400">{relativeTime(entry.ts)}</td>
        <td className="px-4 py-2 text-right">
          <button
            type="button"
            onClick={onToggle}
            className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
          >
            {expanded ? "Hide" : "Details"}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-zinc-100 bg-zinc-50 last:border-0 dark:border-zinc-800 dark:bg-zinc-950">
          <td colSpan={6} className="px-4 py-3">
            <pre className="overflow-x-auto rounded-md bg-white p-3 text-xs dark:bg-zinc-900">
              {JSON.stringify(entry.input, null, 2)}
            </pre>
            {entry.error && (
              <div className="mt-2 text-xs text-red-600 dark:text-red-400">{entry.error}</div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export function Audit() {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([]);
  const [toolFilter, setToolFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const list = useToolQuery("audit.list", { limit: 50, cursor, tool: toolFilter || undefined });

  function toggle(id: string) {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function nextPage() {
    if (!list.data?.nextCursor) return;
    setCursorStack((s) => [...s, cursor]);
    setCursor(list.data.nextCursor);
  }

  function prevPage() {
    setCursorStack((s) => {
      if (s.length === 0) return s;
      const copy = [...s];
      const prev = copy.pop();
      setCursor(prev);
      return copy;
    });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Audit log</h1>

      <div className="flex items-center gap-3">
        <div className="w-64">
          <Input
            placeholder="Filter by tool name…"
            value={toolFilter}
            onChange={(e) => {
              setToolFilter(e.target.value);
              setCursor(undefined);
              setCursorStack([]);
            }}
          />
        </div>
      </div>

      {list.isLoading && <Spinner />}
      {list.isError && <ErrorBanner message={errorMessage(list.error)} />}

      {list.data && (
        <>
          <Card className="p-0">
            <table className="w-full text-sm">
              <tbody>
                {list.data.items.map((entry) => (
                  <AuditRow key={entry.id} entry={entry} expanded={expanded.has(entry.id)} onToggle={() => toggle(entry.id)} />
                ))}
                {list.data.items.length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-center text-zinc-500 dark:text-zinc-400" colSpan={6}>
                      No audit entries found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>

          <div className="flex items-center justify-between">
            <Button variant="secondary" disabled={cursorStack.length === 0} onClick={prevPage}>
              Previous
            </Button>
            <Button variant="secondary" disabled={!list.data.nextCursor} onClick={nextPage}>
              Next page
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
