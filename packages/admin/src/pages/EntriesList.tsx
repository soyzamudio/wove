import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { resolveIcon } from "@wove/blocks";
import { useToolQuery } from "../api";
import { relativeTime } from "../lib/time";
import { columnFields, displayValue, entryTitle } from "../lib/collections";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Input,
  PageHeader,
  SegmentedControl,
  Spinner,
  StatusPill,
  cx,
  errorMessage,
} from "../components/ui";

type StatusFilter = "all" | "draft" | "published";

const TABS: Array<{ label: string; value: StatusFilter }> = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Published", value: "published" },
];

export function EntriesList() {
  const { slug = "" } = useParams();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");

  const collection = useToolQuery("collection.get", { slug }, { enabled: Boolean(slug) });
  const list = useToolQuery(
    "entry.list",
    { collection: slug, status: status === "all" ? undefined : status, q: q || undefined, limit: 50 },
    { enabled: Boolean(slug) }
  );

  const columns = useMemo(() => (collection.data ? columnFields(collection.data) : []), [collection.data]);
  const entries = list.data?.items ?? [];
  const Icon = resolveIcon(collection.data?.icon);
  const plural = collection.data?.namePlural ?? "Entries";

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <span className="text-zinc-400" aria-hidden="true">
              <Icon size={20} />
            </span>
            {plural}
          </span>
        }
        subtitle={collection.data ? `${collection.data.entryCount} total` : undefined}
        actions={
          <Link to={`/c/${slug}/new`}>
            <Button variant="primary">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              New entry
            </Button>
          </Link>
        }
      />

      {collection.isError && <ErrorBanner message={errorMessage(collection.error)} />}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl options={TABS} value={status} onChange={setStatus} ariaLabel="Filter by status" />
        <form
          className="relative w-full sm:w-72"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(qInput);
          }}
        >
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
            aria-hidden="true"
          />
          <Input
            value={qInput}
            aria-label={`Search ${plural.toLowerCase()}`}
            placeholder={`Search ${plural.toLowerCase()}…`}
            className="pl-8"
            onChange={(e) => setQInput(e.target.value)}
          />
        </form>
      </div>

      {(collection.isLoading || list.isLoading) && <Spinner />}
      {list.isError && <ErrorBanner message={errorMessage(list.error)} />}

      {collection.data && list.data && (
        <Card className="overflow-hidden p-0">
          {entries.length === 0 ? (
            <EmptyState
              icon={<Icon size={20} />}
              title={q || status !== "all" ? `No matching ${plural.toLowerCase()}` : `No ${plural.toLowerCase()} yet`}
              description={
                q || status !== "all"
                  ? "Try a different search or status."
                  : `Entries you add here show up wherever the ${collection.data.name} collection is used.`
              }
              action={
                q || status !== "all" ? undefined : (
                  <Link to={`/c/${slug}/new`}>
                    <Button variant="primary">Create your first {collection.data.name.toLowerCase()}</Button>
                  </Link>
                )
              }
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  <th className="px-4 py-2.5 font-medium">Title</th>
                  {columns.map((c) => (
                    <th key={c.key} className="px-4 py-2.5 font-medium">
                      {c.label}
                    </th>
                  ))}
                  <th className="w-32 px-4 py-2.5 font-medium">Status</th>
                  <th className="w-40 px-4 py-2.5 text-right font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className={cx(
                      "border-b border-zinc-100 transition-colors last:border-0 hover:bg-zinc-50 dark:border-zinc-800/80 dark:hover:bg-zinc-900"
                    )}
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        to={`/c/${slug}/${entry.id}`}
                        className="block font-semibold text-zinc-900 hover:text-blue-700 dark:text-zinc-100 dark:hover:text-blue-400"
                      >
                        {entryTitle(collection.data, entry)}
                      </Link>
                    </td>
                    {columns.map((c) => (
                      <td key={c.key} className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400">
                        <Link to={`/c/${slug}/${entry.id}`} className="block truncate">
                          {displayValue(c, entry.data[c.key])}
                        </Link>
                      </td>
                    ))}
                    <td className="px-4 py-2.5">
                      <StatusPill status={entry.status} />
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-500 dark:text-zinc-400">
                      {relativeTime(entry.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  );
}
