import { useRef, useState } from "react";
import { ArrowRight, ExternalLink, Link2, Plus, Search, Trash2, X } from "lucide-react";
import type { NotFoundEntry, Redirect } from "@wove/sdk";
import { useInvalidateTool, useToolMutation, useToolQuery, WoveError } from "../api";
import { relativeTime } from "../lib/time";
import { prefillFrom, validateRedirect } from "../lib/redirects";
import { useToast } from "../context/ToastContext";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorBanner,
  Input,
  Label,
  PageHeader,
  Select,
  Spinner,
  cx,
  errorMessage,
} from "../components/ui";

function isExternal(to: string): boolean {
  return /^https?:\/\//i.test(to);
}

function CodeBadge({ code }: { code: 301 | 302 }) {
  return <Badge tone={code === 301 ? "amber" : "sky"}>{code}</Badge>;
}

function SourceBadge({ source }: { source: Redirect["source"] }) {
  const labels: Record<Redirect["source"], string> = {
    manual: "manual",
    "slug-change": "slug change",
    import: "import",
  };
  return <Badge tone="neutral">{labels[source]}</Badge>;
}

// ---------------------------------------------------------------------------
// Create form
// ---------------------------------------------------------------------------

function CreateRedirectForm({
  formRef,
  prefilledFrom,
  onClearPrefill,
}: {
  formRef: React.RefObject<HTMLDivElement>;
  prefilledFrom: string;
  onClearPrefill: () => void;
}) {
  const toast = useToast();
  const invalidate = useInvalidateTool();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [code, setCode] = useState<"301" | "302">("301");
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);

  // Keep the From field in sync with an incoming prefill from the 404 log.
  const lastPrefill = useRef("");
  if (prefilledFrom && prefilledFrom !== lastPrefill.current) {
    lastPrefill.current = prefilledFrom;
    setFrom(prefilledFrom);
  }

  const create = useToolMutation("redirect.create", {
    onSuccess: () => {
      toast.success("Redirect created");
      setFrom("");
      setTo("");
      setCode("301");
      setFieldError(undefined);
      onClearPrefill();
      invalidate("redirect.list");
      invalidate("notfound.list");
    },
    onError: (err) => {
      if (err instanceof WoveError && err.status === 409) {
        toast.error("A redirect from that path already exists");
        return;
      }
      toast.error(errorMessage(err));
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const result = validateRedirect(from, to);
    if (!result.ok) {
      setFieldError(result.error);
      return;
    }
    setFieldError(undefined);
    create.mutate({ fromPath: from.trim(), toPath: to.trim(), code: Number(code) as 301 | 302 });
  }

  return (
    <div ref={formRef}>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <div className="w-full sm:w-56">
          <Label htmlFor="redirect-from">From</Label>
          <Input
            id="redirect-from"
            placeholder="/old-path"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="font-mono text-sm"
          />
        </div>
        <div className="w-full sm:w-56">
          <Label htmlFor="redirect-to">To</Label>
          <Input
            id="redirect-to"
            placeholder="/new-path or https://…"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="font-mono text-sm"
          />
        </div>
        <div className="w-28">
          <Label htmlFor="redirect-code">Code</Label>
          <Select id="redirect-code" value={code} onChange={(e) => setCode(e.target.value as "301" | "302")}>
            <option value="301">301</option>
            <option value="302">302</option>
          </Select>
        </div>
        <Button type="submit" disabled={create.isPending}>
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </form>
      {fieldError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{fieldError}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Redirects table
// ---------------------------------------------------------------------------

function RedirectsTable({ redirects, onDelete }: { redirects: Redirect[]; onDelete: (r: Redirect) => void }) {
  if (redirects.length === 0) {
    return (
      <EmptyState
        icon={<Link2 className="h-5 w-5" />}
        title="No redirects yet"
        description="They're created automatically when you change a published post's slug."
      />
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-zinc-200 text-left text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          <th className="px-4 py-2.5 font-medium">From</th>
          <th className="px-4 py-2.5 font-medium" />
          <th className="px-4 py-2.5 font-medium">To</th>
          <th className="px-4 py-2.5 font-medium">Code</th>
          <th className="px-4 py-2.5 font-medium">Source</th>
          <th className="px-4 py-2.5 font-medium">Hits</th>
          <th className="px-4 py-2.5 font-medium">Created</th>
          <th className="px-4 py-2.5 font-medium" />
        </tr>
      </thead>
      <tbody>
        {redirects.map((r) => (
          <tr
            key={r.id}
            className="border-b border-zinc-100 transition-colors last:border-0 hover:bg-zinc-50 dark:border-zinc-800/80 dark:hover:bg-zinc-900"
          >
            <td className="px-4 py-2.5 font-mono text-xs">{r.fromPath}</td>
            <td className="px-4 py-2.5 text-zinc-400">
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </td>
            <td className="px-4 py-2.5 font-mono text-xs">
              <span className="inline-flex items-center gap-1">
                {r.toPath}
                {isExternal(r.toPath) && <ExternalLink className="h-3 w-3 shrink-0 text-zinc-400" aria-hidden="true" />}
              </span>
            </td>
            <td className="px-4 py-2.5">
              <CodeBadge code={r.code} />
            </td>
            <td className="px-4 py-2.5">
              <SourceBadge source={r.source} />
            </td>
            <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400">{r.hits}</td>
            <td className="px-4 py-2.5 text-zinc-500 dark:text-zinc-400">{relativeTime(r.createdAt)}</td>
            <td className="px-4 py-2.5 text-right">
              <button
                type="button"
                onClick={() => onDelete(r)}
                className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
              >
                Delete
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// 404 log table
// ---------------------------------------------------------------------------

function NotFoundTable({
  entries,
  onCreateRedirect,
  onDismiss,
}: {
  entries: NotFoundEntry[];
  onCreateRedirect: (entry: NotFoundEntry) => void;
  onDismiss: (entry: NotFoundEntry) => void;
}) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<Search className="h-5 w-5" />}
        title="No 404s recorded from your site"
      />
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-zinc-200 text-left text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          <th className="px-4 py-2.5 font-medium">Path</th>
          <th className="px-4 py-2.5 font-medium">Count</th>
          <th className="px-4 py-2.5 font-medium">Last seen</th>
          <th className="px-4 py-2.5 font-medium">Referrer</th>
          <th className="px-4 py-2.5 font-medium" />
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr
            key={entry.path}
            className="border-b border-zinc-100 transition-colors last:border-0 hover:bg-zinc-50 dark:border-zinc-800/80 dark:hover:bg-zinc-900"
          >
            <td className="px-4 py-2.5 font-mono text-xs">{entry.path}</td>
            <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400">{entry.count}</td>
            <td className="px-4 py-2.5 text-zinc-500 dark:text-zinc-400">{relativeTime(entry.lastSeen)}</td>
            <td className="max-w-[16rem] truncate px-4 py-2.5 text-zinc-500 dark:text-zinc-400" title={entry.referrer ?? undefined}>
              {entry.referrer ?? "—"}
            </td>
            <td className="px-4 py-2.5 text-right">
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => onCreateRedirect(entry)}
                  className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  Create redirect
                </button>
                <button
                  type="button"
                  aria-label={`Dismiss ${entry.path}`}
                  onClick={() => onDismiss(entry)}
                  className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function Redirects() {
  const toast = useToast();
  const invalidate = useInvalidateTool();
  const formRef = useRef<HTMLDivElement>(null);
  const [prefilledFrom, setPrefilledFrom] = useState("");

  const [nfCursor, setNfCursor] = useState<string | undefined>(undefined);
  const [nfItems, setNfItems] = useState<NotFoundEntry[]>([]);

  const redirects = useToolQuery("redirect.list", {});
  const notFound = useToolQuery("notfound.list", { limit: 50, cursor: nfCursor });

  // Accumulate pages for "Load more" rather than replacing.
  const items = nfCursor === undefined ? notFound.data?.items ?? [] : [...nfItems, ...(notFound.data?.items ?? [])];

  const del = useToolMutation("redirect.delete", {
    onSuccess: () => {
      toast.success("Redirect deleted");
      invalidate("redirect.list");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const dismiss = useToolMutation("notfound.clear", {
    onSuccess: () => {
      invalidate("notfound.list");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const clearAll = useToolMutation("notfound.clear", {
    onSuccess: (data) => {
      toast.success(data.cleared > 0 ? `Cleared ${data.cleared} 404 ${data.cleared === 1 ? "entry" : "entries"}` : "404 log cleared");
      setNfCursor(undefined);
      setNfItems([]);
      invalidate("notfound.list");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  function handleDeleteRedirect(r: Redirect) {
    if (!window.confirm(`Delete the redirect from "${r.fromPath}"?`)) return;
    del.mutate({ id: r.id });
  }

  function handleCreateFromEntry(entry: NotFoundEntry) {
    setPrefilledFrom(prefillFrom(entry.path));
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    // Focus the To field after scroll settles.
    setTimeout(() => document.getElementById("redirect-to")?.focus(), 300);
  }

  function handleDismissEntry(entry: NotFoundEntry) {
    dismiss.mutate({ path: entry.path });
  }

  function handleLoadMore() {
    if (!notFound.data?.nextCursor) return;
    setNfItems(items);
    setNfCursor(notFound.data.nextCursor);
  }

  function handleClearAll() {
    if (!window.confirm("Clear the entire 404 log? This cannot be undone.")) return;
    clearAll.mutate({});
  }

  return (
    <div>
      <PageHeader title="Redirects" subtitle="Manage redirects and review 404s from your site" />

      <div className="space-y-6">
        <Card>
          <CardHeader title="Redirects" />
          <div className="mb-4">
            <CreateRedirectForm
              formRef={formRef}
              prefilledFrom={prefilledFrom}
              onClearPrefill={() => setPrefilledFrom("")}
            />
          </div>

          {redirects.isLoading && <Spinner />}
          {redirects.isError && <ErrorBanner message={errorMessage(redirects.error)} />}
          {redirects.data && (
            <div className={cx("-mx-4 -mb-4 overflow-hidden", redirects.data.length > 0 && "border-t border-zinc-200 dark:border-zinc-800")}>
              <RedirectsTable redirects={redirects.data} onDelete={handleDeleteRedirect} />
            </div>
          )}
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="p-4">
            <CardHeader
              title="404 log"
              action={
                items.length > 0 ? (
                  <Button variant="secondary" size="sm" onClick={handleClearAll} disabled={clearAll.isPending}>
                    <Trash2 className="h-3.5 w-3.5" />
                    Clear log
                  </Button>
                ) : undefined
              }
            />
          </div>

          {notFound.isLoading && nfCursor === undefined && <Spinner />}
          {notFound.isError && <ErrorBanner message={errorMessage(notFound.error)} />}
          {notFound.data && (
            <>
              <div className="border-t border-zinc-200 dark:border-zinc-800">
                <NotFoundTable entries={items} onCreateRedirect={handleCreateFromEntry} onDismiss={handleDismissEntry} />
              </div>
              {notFound.data.nextCursor && (
                <div className="flex justify-center border-t border-zinc-200 p-3 dark:border-zinc-800">
                  <Button variant="secondary" size="sm" onClick={handleLoadMore} disabled={notFound.isFetching}>
                    Load more
                  </Button>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
