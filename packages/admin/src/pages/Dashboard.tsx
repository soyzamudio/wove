import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bot, FilePlus2, FileText, Files, LayoutTemplate, Sparkles } from "lucide-react";
import { useInvalidateTool, useToolMutation, useToolQuery } from "../api";
import { relativeTime } from "../lib/time";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import {
  ActorBadge,
  Button,
  Card,
  CardHeader,
  ChannelBadge,
  Dot,
  ErrorBanner,
  Input,
  Label,
  PageHeader,
  Spinner,
  StatRow,
  StatusPill,
  errorMessage,
} from "../components/ui";
import { RichMarkdownEditor } from "../components/RichMarkdownEditor";
import { slugify } from "../lib/slug";

const HERO_BTN =
  "inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-sm font-medium text-white backdrop-blur transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70";

export function Dashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const invalidate = useInvalidateTool();

  const site = useToolQuery("site.info", {});
  const audit = useToolQuery("audit.list", { limit: 10 });
  const recent = useToolQuery("post.list", { type: "post", limit: 5 });
  const aiConfig = useToolQuery("ai.config", {});
  const since30d = useMemo(() => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), []);
  const usage = useToolQuery("ai.usage", { limit: 1, since: since30d });

  const [quickTitle, setQuickTitle] = useState("");
  const [quickContent, setQuickContent] = useState("");

  const quickDraft = useToolMutation("post.create", {
    onSuccess: (created) => {
      toast.success("Draft saved");
      invalidate("post.list");
      setQuickTitle("");
      setQuickContent("");
      navigate(`/posts/${created.id}`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const firstName = (user?.name ?? "").split(/\s+/)[0] || "there";
  const aiConfigured = !!aiConfig.data && aiConfig.data.keySource !== "none";
  const tokens30d = usage.data ? usage.data.totals.inputTokens + usage.data.totals.outputTokens : null;

  return (
    <div>
      <PageHeader title="Dashboard" subtitle={site.data?.settings.siteTitle || undefined} />

      <div className="space-y-6">
        <section className="wv-auth-hero relative overflow-hidden rounded-xl px-6 py-8 shadow-sm sm:px-8 sm:py-10">
          <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Welcome back, {firstName}!
          </h2>
          <p className="mt-1 text-sm text-zinc-300">What would you like to do today?</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              to="/posts/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />
              Create post
            </Link>
            <Link to="/pages/new" className={HERO_BTN}>
              <Files className="h-3.5 w-3.5" aria-hidden="true" />
              Create page
            </Link>
            <Link to="/posts?ai=1" className={HERO_BTN}>
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Draft with AI
            </Link>
            <Link to="/templates" className={HERO_BTN}>
              <LayoutTemplate className="h-3.5 w-3.5" aria-hidden="true" />
              Browse templates
            </Link>
            <Link to="/agents" className={HERO_BTN}>
              <Bot className="h-3.5 w-3.5" aria-hidden="true" />
              Manage agents
            </Link>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader title="Quick draft" />
              <div className="space-y-3">
                <div>
                  <Label htmlFor="quick-title">Title</Label>
                  <Input
                    id="quick-title"
                    value={quickTitle}
                    onChange={(e) => setQuickTitle(e.target.value)}
                    placeholder="What's on your mind?"
                  />
                </div>
                <div>
                  <Label>Content</Label>
                  <RichMarkdownEditor
                    value={quickContent}
                    onChange={setQuickContent}
                    variant="compact"
                    placeholder="Start writing…"
                    surfaceId="dashboard-quick-draft"
                    ariaLabel="Content"
                  />
                </div>
                <Button
                  variant="primary"
                  disabled={quickDraft.isPending || quickTitle.trim().length === 0}
                  onClick={() =>
                    quickDraft.mutate({
                      type: "post",
                      title: quickTitle.trim(),
                      slug: slugify(quickTitle),
                      content: quickContent,
                      status: "draft",
                    })
                  }
                >
                  {quickDraft.isPending ? "Saving…" : "Save draft"}
                </Button>
                {quickDraft.isError && <ErrorBanner message={errorMessage(quickDraft.error)} />}
              </div>
            </Card>

            <Card className="p-0">
              <div className="px-4 pt-4">
                <CardHeader
                  title="Recent posts"
                  action={
                    <Link to="/posts" className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">
                      View all
                    </Link>
                  }
                />
              </div>
              {recent.isLoading && <div className="px-4">
                <Spinner />
              </div>}
              {recent.isError && <div className="px-4 pb-4"><ErrorBanner message={errorMessage(recent.error)} /></div>}
              {recent.data && (
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {recent.data.items.map((post) => (
                    <li key={post.id}>
                      <Link
                        to={`/posts/${post.id}`}
                        className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
                      >
                        <FileText className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {post.title || "(untitled)"}
                        </span>
                        <StatusPill status={post.status} />
                        <span className="w-28 shrink-0 text-right text-xs text-zinc-500 dark:text-zinc-400">
                          {relativeTime(post.updatedAt)}
                        </span>
                      </Link>
                    </li>
                  ))}
                  {recent.data.items.length === 0 && (
                    <li className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">No posts yet.</li>
                  )}
                </ul>
              )}
              <div className="h-2" />
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader
                title="Site health"
                action={
                  <Link to="/settings" className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">
                    Open settings
                  </Link>
                }
              />
              {site.isLoading && <Spinner />}
              {site.isError && <ErrorBanner message={errorMessage(site.error)} />}
              {site.data && (
                <div>
                  {site.data.update && <UpdateBanner update={site.data.update} />}
                  <StatRow label="Wove version" value={site.data.version} tone="green" />
                  <StatRow label="Posts" value={site.data.counts.posts} tone="neutral" />
                  <StatRow label="Pages" value={site.data.counts.pages} tone="neutral" />
                  <StatRow label="Media" value={site.data.counts.media} tone="neutral" />
                  <StatRow
                    label="AI key"
                    value={aiConfigured ? "Configured" : "Not configured"}
                    tone={aiConfigured ? "green" : "amber"}
                  />
                  {tokens30d !== null && (
                    <StatRow label="AI tokens (30d)" value={tokens30d.toLocaleString()} tone="neutral" />
                  )}
                </div>
              )}
            </Card>

            <Card className="p-0">
              <div className="px-4 pt-4">
                <CardHeader
                  title="Recent activity"
                  action={
                    <Link to="/audit" className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">
                      Audit log
                    </Link>
                  }
                />
              </div>
              {audit.isLoading && <div className="px-4"><Spinner /></div>}
              {audit.isError && <div className="px-4 pb-4"><ErrorBanner message={errorMessage(audit.error)} /></div>}
              {audit.data && (
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {audit.data.items.map((entry) => (
                    <li key={entry.id} className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <ActorBadge kind={entry.actorKind} />
                        <ChannelBadge channel={entry.channel} />
                        <span className="ml-auto text-xs text-zinc-500 dark:text-zinc-400">
                          {relativeTime(entry.ts)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="font-mono text-xs text-zinc-700 dark:text-zinc-300">{entry.tool}</span>
                        {!entry.ok && <span className="text-xs text-red-600 dark:text-red-400">error</span>}
                      </div>
                    </li>
                  ))}
                  {audit.data.items.length === 0 && (
                    <li className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                      No activity yet.
                    </li>
                  )}
                </ul>
              )}
              <div className="h-2" />
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Shown only when core's daily update check found a newer release. The install hint is
 * whatever command upgrades *this* deployment, so it can be copied and pasted as-is.
 */
function UpdateBanner({ update }: { update: { latest: string; url: string; installHint: string } }) {
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(update.installHint);
      toast.success("Update command copied to clipboard");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };
  return (
    <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
      <div className="flex items-center gap-2">
        <Dot tone="amber" />
        <a
          href={update.url}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium text-amber-900 hover:underline dark:text-amber-200"
        >
          Wove {update.latest} available
        </a>
      </div>
      <button
        type="button"
        onClick={copy}
        title="Copy to clipboard"
        className="mt-2 block w-full truncate rounded-md border border-amber-200 bg-white/70 px-2 py-1 text-left font-mono text-xs text-amber-900 hover:bg-white dark:border-amber-900/50 dark:bg-zinc-900/60 dark:text-amber-200 dark:hover:bg-zinc-900"
      >
        {update.installHint}
      </button>
    </div>
  );
}
