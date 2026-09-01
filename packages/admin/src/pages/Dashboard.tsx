import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useToolQuery } from "../api";
import { relativeTime } from "../lib/time";
import { ActorBadge, Card, ChannelBadge, ErrorBanner, Spinner, errorMessage } from "../components/ui";

export function Dashboard() {
  const site = useToolQuery("site.info", {});
  const audit = useToolQuery("audit.list", { limit: 10 });
  const since30d = useMemo(() => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), []);
  const usage = useToolQuery("ai.usage", { limit: 1, since: since30d });
  const showUsage = Boolean(usage.data);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {site.isLoading && <Spinner />}
      {site.isError && <ErrorBanner message={errorMessage(site.error)} />}
      {site.data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <Card>
            <div className="text-sm text-zinc-500 dark:text-zinc-400">Posts</div>
            <div className="text-3xl font-bold">{site.data.counts.posts}</div>
          </Card>
          <Card>
            <div className="text-sm text-zinc-500 dark:text-zinc-400">Pages</div>
            <div className="text-3xl font-bold">{site.data.counts.pages}</div>
          </Card>
          <Card>
            <div className="text-sm text-zinc-500 dark:text-zinc-400">Media</div>
            <div className="text-3xl font-bold">{site.data.counts.media}</div>
          </Card>
          {showUsage && usage.data && (
            <Card>
              <div className="text-sm text-zinc-500 dark:text-zinc-400">AI tokens (30d)</div>
              <div className="text-3xl font-bold">
                {(usage.data.totals.inputTokens + usage.data.totals.outputTokens).toLocaleString()}
              </div>
            </Card>
          )}
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent activity</h2>
          <Link to="/audit" className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
            View full audit log →
          </Link>
        </div>

        {audit.isLoading && <Spinner />}
        {audit.isError && <ErrorBanner message={errorMessage(audit.error)} />}
        {audit.data && (
          <Card className="p-0">
            <table className="w-full text-sm">
              <tbody>
                {audit.data.items.map((entry) => (
                  <tr key={entry.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
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
                    <td className="px-4 py-2 text-right text-zinc-500 dark:text-zinc-400">{relativeTime(entry.ts)}</td>
                  </tr>
                ))}
                {audit.data.items.length === 0 && (
                  <tr>
                    <td className="px-4 py-6 text-center text-zinc-500 dark:text-zinc-400" colSpan={5}>
                      No activity yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}
