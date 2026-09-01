import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Clock, FileText, Plus, RotateCcw, Search, Sparkles, Trash2 } from "lucide-react";
import type { Post } from "@wove/sdk";
import { useInvalidateTool, useToolMutation, useToolQuery } from "../api";
import { relativeTime } from "../lib/time";
import { useToast } from "../context/ToastContext";
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Input,
  Label,
  Modal,
  PageHeader,
  SegmentedControl,
  Spinner,
  StatusPill,
  Textarea,
  cx,
  errorMessage,
} from "../components/ui";

type StatusFilter = "all" | "draft" | "published" | "scheduled" | "trashed";
type BulkAction = "trash" | "restore" | "delete" | "publish" | "draft";

const TABS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Published", value: "published" },
  { label: "Scheduled", value: "scheduled" },
  { label: "Trash", value: "trashed" },
];

const BULK_LABELS: Record<BulkAction, string> = {
  trash: "Trash",
  restore: "Restore",
  publish: "Publish",
  draft: "Draft",
  delete: "Delete permanently",
};

/** Destructive actions get a confirm. */
const BULK_CONFIRM: Partial<Record<BulkAction, (n: number, noun: string) => string>> = {
  delete: (n, noun) => `Permanently delete ${n} ${noun}? This cannot be undone.`,
  draft: (n, noun) => `Unpublish ${n} ${noun} back to draft?`,
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function PostsList({ postType }: { postType: "post" | "page" }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [draftOpen, setDraftOpen] = useState(searchParams.get("ai") === "1");
  const [draftPrompt, setDraftPrompt] = useState("");
  const [draftTags, setDraftTags] = useState("");

  const navigate = useNavigate();
  const toast = useToast();
  const invalidate = useInvalidateTool();

  const basePath = postType === "post" ? "/posts" : "/pages";
  const heading = postType === "post" ? "Posts" : "Pages";
  const noun = postType === "post" ? "Post" : "Page";
  const isTrash = status === "trashed";

  const list = useToolQuery("post.list", {
    type: postType,
    status: status === "all" ? undefined : status,
    q: q || undefined,
    limit: 50,
  });

  const items: Post[] = list.data?.items ?? [];
  const visibleIds = useMemo(() => items.map((p) => p.id), [items]);

  // Drop selections for rows that are no longer on screen.
  useEffect(() => {
    setSelected((cur) => cur.filter((id) => visibleIds.includes(id)));
  }, [visibleIds]);

  const allSelected = items.length > 0 && selected.length === items.length;

  function refresh() {
    invalidate("post.list");
    invalidate("post.get");
  }

  const bulk = useToolMutation("post.bulk", {
    onError: (err) => toast.error(errorMessage(err)),
  });

  const restoreOne = useToolMutation("post.restore", {
    onSuccess: () => {
      toast.success(`${noun} restored`);
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const deleteOne = useToolMutation("post.delete", {
    onSuccess: () => {
      toast.success(`${noun} deleted`);
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const emptyTrash = useToolMutation("post.emptyTrash", {
    onSuccess: (res) => {
      toast.success(`Trash emptied (${res.deleted} deleted)`);
      setSelected([]);
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const draftMutation = useToolMutation("ai.draftPost", {
    onSuccess: (created) => {
      toast.success(`${noun} drafted`);
      invalidate("post.list");
      closeDraftModal();
      navigate(`${basePath}/${created.id}`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  function runBulk(action: BulkAction) {
    if (selected.length === 0) return;
    const confirm = BULK_CONFIRM[action];
    const label = selected.length === 1 ? noun.toLowerCase() : `${noun.toLowerCase()}s`;
    if (confirm && !window.confirm(confirm(selected.length, label))) return;
    bulk.mutate(
      { ids: selected, action },
      {
        onSuccess: (res) => {
          toast.success(`${BULK_LABELS[action]}: ${res.affected} ${label}`);
          setSelected([]);
          refresh();
        },
      }
    );
  }

  function closeDraftModal() {
    setDraftOpen(false);
    setDraftPrompt("");
    setDraftTags("");
    if (searchParams.get("ai")) {
      searchParams.delete("ai");
      setSearchParams(searchParams, { replace: true });
    }
  }

  function handleGenerate() {
    const terms = draftTags
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((name) => ({ taxonomy: "tag", name }));
    draftMutation.mutate({
      prompt: draftPrompt,
      type: postType,
      terms: terms.length > 0 ? terms : undefined,
    });
  }

  const bulkActions: BulkAction[] = isTrash ? ["restore", "delete"] : ["trash", "publish", "draft", "delete"];

  return (
    <div>
      <PageHeader
        title={heading}
        actions={
          <>
            {isTrash && (
              <Button
                variant="secondary"
                disabled={emptyTrash.isPending || items.length === 0}
                onClick={() => {
                  if (window.confirm("Permanently delete everything in the trash? This cannot be undone.")) {
                    emptyTrash.mutate({});
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                {emptyTrash.isPending ? "Emptying…" : "Empty trash"}
              </Button>
            )}
            <Button variant="secondary" onClick={() => setDraftOpen(true)}>
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Draft with AI
            </Button>
            <Link to={`${basePath}/new`}>
              <Button variant="primary">
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                New {noun.toLowerCase()}
              </Button>
            </Link>
          </>
        }
      />

      <Modal
        open={draftOpen}
        onClose={closeDraftModal}
        title={`Draft ${noun.toLowerCase()} with AI`}
        footer={
          <>
            <Button variant="secondary" onClick={closeDraftModal} disabled={draftMutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleGenerate}
              disabled={draftMutation.isPending || draftPrompt.trim().length === 0}
            >
              {draftMutation.isPending ? "Generating…" : "Generate"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <Label>Prompt</Label>
            <Textarea
              rows={5}
              value={draftPrompt}
              onChange={(e) => setDraftPrompt(e.target.value)}
              placeholder={`Describe the ${noun.toLowerCase()} you want to generate…`}
              required
            />
          </div>

          <div>
            <Label>Tags (comma-separated)</Label>
            <Input value={draftTags} onChange={(e) => setDraftTags(e.target.value)} placeholder="tag-one, tag-two" />
          </div>

          {draftMutation.isError && <ErrorBanner message={errorMessage(draftMutation.error)} />}
        </div>
      </Modal>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl
          options={TABS}
          value={status}
          onChange={(next) => {
            setStatus(next);
            setSelected([]);
          }}
          ariaLabel="Filter by status"
        />

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
            aria-label={`Search ${heading.toLowerCase()}`}
            placeholder="Search…"
            className="pl-8"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            onBlur={() => setQ(qInput)}
          />
        </form>
      </div>

      {selected.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-sm text-blue-900 dark:border-blue-900/70 dark:bg-blue-950/50 dark:text-blue-100">
          <span className="font-medium">
            {selected.length} selected
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {bulkActions.map((action) => (
              <Button
                key={action}
                size="sm"
                variant={action === "delete" ? "danger" : "secondary"}
                disabled={bulk.isPending}
                onClick={() => runBulk(action)}
              >
                {BULK_LABELS[action]}
              </Button>
            ))}
          </div>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected([])}>
            Clear
          </Button>
        </div>
      )}

      {list.isLoading && <Spinner />}
      {list.isError && <ErrorBanner message={errorMessage(list.error)} />}

      {list.data && (
        <Card className="overflow-hidden p-0">
          {items.length === 0 ? (
            <EmptyState
              icon={isTrash ? <Trash2 className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
              title={isTrash ? "Trash is empty" : `No ${heading.toLowerCase()} found`}
              description={
                isTrash
                  ? `Deleted ${heading.toLowerCase()} land here until you delete them for good.`
                  : q || status !== "all"
                    ? "Try a different filter or search term."
                    : `Everything you publish starts here.`
              }
              action={
                isTrash ? undefined : (
                  <Link to={`${basePath}/new`}>
                    <Button variant="primary">Create your first {noun.toLowerCase()}</Button>
                  </Link>
                )
              }
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  <th className="w-10 px-4 py-2.5">
                    <input
                      type="checkbox"
                      aria-label={`Select all ${heading.toLowerCase()}`}
                      checked={allSelected}
                      onChange={(e) => setSelected(e.target.checked ? visibleIds : [])}
                      className="h-3.5 w-3.5 rounded border-zinc-300 text-blue-600 focus:ring-blue-600 dark:border-zinc-700"
                    />
                  </th>
                  <th className="px-4 py-2.5 font-medium">Title</th>
                  <th className="w-40 px-4 py-2.5 font-medium">Status</th>
                  <th className={cx("px-4 py-2.5 text-right font-medium", isTrash ? "w-56" : "w-40")}>
                    {isTrash ? "Actions" : "Updated"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((post) => {
                  const checked = selected.includes(post.id);
                  return (
                    <tr
                      key={post.id}
                      className={cx(
                        "border-b border-zinc-100 transition-colors last:border-0 dark:border-zinc-800/80",
                        checked ? "bg-blue-50/60 dark:bg-blue-950/30" : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
                      )}
                    >
                      <td className="px-4 py-2.5">
                        <input
                          type="checkbox"
                          aria-label={`Select ${post.title || post.slug}`}
                          checked={checked}
                          onChange={(e) =>
                            setSelected((cur) => (e.target.checked ? [...cur, post.id] : cur.filter((id) => id !== post.id)))
                          }
                          className="h-3.5 w-3.5 rounded border-zinc-300 text-blue-600 focus:ring-blue-600 dark:border-zinc-700"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <Link to={`${basePath}/${post.id}`} className="block">
                          <div className="font-semibold text-zinc-900 hover:text-blue-700 dark:text-zinc-100 dark:hover:text-blue-400">
                            {post.title || "(untitled)"}
                          </div>
                          <div className="font-mono text-xs text-zinc-500 dark:text-zinc-400">/{post.slug}</div>
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-col items-start gap-1">
                          <StatusPill status={post.status} />
                          {post.status === "scheduled" && (
                            <span className="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400">
                              <Clock className="h-3 w-3" aria-hidden="true" />
                              {formatDate(post.publishedAt)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right text-zinc-500 dark:text-zinc-400">
                        {isTrash ? (
                          <div className="flex justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={restoreOne.isPending}
                              onClick={() => restoreOne.mutate({ id: post.id })}
                            >
                              <RotateCcw className="h-3 w-3" aria-hidden="true" />
                              Restore
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              disabled={deleteOne.isPending}
                              onClick={() => {
                                if (window.confirm(`Permanently delete "${post.title || post.slug}"? This cannot be undone.`)) {
                                  deleteOne.mutate({ id: post.id, permanent: true });
                                }
                              }}
                            >
                              Delete permanently
                            </Button>
                          </div>
                        ) : (
                          relativeTime(post.updatedAt)
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  );
}
