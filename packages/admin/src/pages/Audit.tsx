import { useState } from "react";
import { ScrollText, Search } from "lucide-react";
import type { AuditEntry } from "@agentpress/sdk";
import { useToolQuery } from "../api";
import { relativeTime } from "../lib/time";
import {
  ActorBadge,
  Button,
  Card,
  ChannelBadge,
  EmptyState,
  ErrorBanner,
  Input,
  PageHeader,
  Spinner,
  errorMessage,
} from "../components/ui";

function AuditRow({ entry, expanded, onToggle }: { entry: AuditEntry; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="border-b border-zinc-100 transition-colors last:border-0 hover:bg-zinc-50 dark:border-zinc-800/80 dark:hover:bg-zinc-900">
        <td className="px-4 py-2.5">
          <ActorBadge kind={entry.actorKind} />
        </td>
        <td className="px-4 py-2.5">
          <ChannelBadge channel={entry.channel} />
        </td>
        <td className="px-4 py-2.5 font-mono text-xs">{entry.tool}</td>
        <td className="px-4 py-2.5">
          <span className={entry.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
            {entry.ok ? "ok" : "error"}
          </span>
        </td>
        <td className="px-4 py-2.5 text-zinc-500 dark:text-zinc-400">{relativeTime(entry.ts)}</td>
        <td className="px-4 py-2.5 text-right">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            {expanded ? "Hide" : "Details"}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-zinc-100 bg-zinc-50 last:border-0 dark:border-zinc-800/80 dark:bg-zinc-900">
          <td colSpan={6} className="px-4 py-3">
            <pre className="overflow-x-auto rounded-lg border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-800 dark:bg-zinc-950">
              {JSON.stringify(entry.input, null, 2)}
            </pre>
            {entry.error && <div className="mt-2 text-xs text-red-600 dark:text-red-400">{entry.error}</div>}
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
    <div>
      <PageHeader title="Audit log" subtitle="Every tool call made against this site" />

      <div className="mb-4 flex items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
            aria-hidden="true"
          />
          <Input
            aria-label="Filter by tool name"
            placeholder="Filter by tool name…"
            className="pl-8"
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
        <div className="space-y-4">
          <Card className="overflow-hidden p-0">
            {list.data.items.length === 0 ? (
              <EmptyState
                icon={<ScrollText className="h-5 w-5" />}
                title="No audit entries found"
                description="Tool calls from the admin, the site and your agents show up here."
              />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    <th className="px-4 py-2.5 font-medium">Actor</th>
                    <th className="px-4 py-2.5 font-medium">Channel</th>
                    <th className="px-4 py-2.5 font-medium">Tool</th>
                    <th className="px-4 py-2.5 font-medium">Result</th>
                    <th className="px-4 py-2.5 font-medium">When</th>
                    <th className="px-4 py-2.5 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((entry) => (
                    <AuditRow
                      key={entry.id}
                      entry={entry}
                      expanded={expanded.has(entry.id)}
                      onToggle={() => toggle(entry.id)}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <div className="flex items-center justify-between">
            <Button variant="secondary" disabled={cursorStack.length === 0} onClick={prevPage}>
              Previous
            </Button>
            <Button variant="secondary" disabled={!list.data.nextCursor} onClick={nextPage}>
              Next page
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
