import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { FileText, Plus, Search, Sparkles } from "lucide-react";
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
  errorMessage,
} from "../components/ui";

type StatusFilter = "all" | "draft" | "published" | "scheduled";

const TABS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Published", value: "published" },
  { label: "Scheduled", value: "scheduled" },
];

export function PostsList({ postType }: { postType: "post" | "page" }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [draftOpen, setDraftOpen] = useState(searchParams.get("ai") === "1");
  const [draftPrompt, setDraftPrompt] = useState("");
  const [draftTags, setDraftTags] = useState("");

  const navigate = useNavigate();
  const toast = useToast();
  const invalidate = useInvalidateTool();

  const basePath = postType === "post" ? "/posts" : "/pages";
  const heading = postType === "post" ? "Posts" : "Pages";
  const noun = postType === "post" ? "Post" : "Page";

  const list = useToolQuery("post.list", {
    type: postType,
    status: status === "all" ? undefined : status,
    q: q || undefined,
    limit: 50,
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

  return (
    <div>
      <PageHeader
        title={heading}
        actions={
          <>
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
            aria-label={`Search ${heading.toLowerCase()}`}
            placeholder="Search…"
            className="pl-8"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            onBlur={() => setQ(qInput)}
          />
        </form>
      </div>

      {list.isLoading && <Spinner />}
      {list.isError && <ErrorBanner message={errorMessage(list.error)} />}

      {list.data && (
        <Card className="overflow-hidden p-0">
          {list.data.items.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-5 w-5" />}
              title={`No ${heading.toLowerCase()} found`}
              description={
                q || status !== "all"
                  ? "Try a different filter or search term."
                  : `Everything you publish starts here.`
              }
              action={
                <Link to={`${basePath}/new`}>
                  <Button variant="primary">Create your first {noun.toLowerCase()}</Button>
                </Link>
              }
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  <th className="px-4 py-2.5 font-medium">Title</th>
                  <th className="w-32 px-4 py-2.5 font-medium">Status</th>
                  <th className="w-40 px-4 py-2.5 text-right font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((post) => (
                  <tr
                    key={post.id}
                    className="border-b border-zinc-100 transition-colors last:border-0 hover:bg-zinc-50 dark:border-zinc-800/80 dark:hover:bg-zinc-900"
                  >
                    <td className="px-4 py-2.5">
                      <Link to={`${basePath}/${post.id}`} className="block">
                        <div className="font-semibold text-zinc-900 hover:text-blue-700 dark:text-zinc-100 dark:hover:text-blue-400">
                          {post.title || "(untitled)"}
                        </div>
                        <div className="font-mono text-xs text-zinc-500 dark:text-zinc-400">/{post.slug}</div>
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusPill status={post.status} />
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-500 dark:text-zinc-400">
                      {relativeTime(post.updatedAt)}
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
