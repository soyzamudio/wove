import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useInvalidateTool, useToolMutation, useToolQuery } from "../api";
import { relativeTime } from "../lib/time";
import { useToast } from "../context/ToastContext";
import { Button, Card, ErrorBanner, Input, Label, Spinner, StatusPill, Textarea, errorMessage } from "../components/ui";

type StatusFilter = "all" | "draft" | "published" | "scheduled";

const TABS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Published", value: "published" },
  { label: "Scheduled", value: "scheduled" },
];

export function PostsList({ postType }: { postType: "post" | "page" }) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [draftOpen, setDraftOpen] = useState(false);
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{heading}</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setDraftOpen(true)}>
            Draft with AI
          </Button>
          <Link to={`${basePath}/new`}>
            <Button variant="primary">New</Button>
          </Link>
        </div>
      </div>

      {draftOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <Card className="w-full max-w-lg space-y-4">
            <h2 className="text-lg font-semibold">Draft {noun.toLowerCase()} with AI</h2>

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
              <Input
                value={draftTags}
                onChange={(e) => setDraftTags(e.target.value)}
                placeholder="tag-one, tag-two"
              />
            </div>

            {draftMutation.isError && <ErrorBanner message={errorMessage(draftMutation.error)} />}

            <div className="flex justify-end gap-2">
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
            </div>
          </Card>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatus(tab.value)}
              className={
                "rounded-md px-3 py-1.5 text-sm font-medium " +
                (status === tab.value
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800")
              }
            >
              {tab.label}
            </button>
          ))}
        </div>

        <form
          className="w-full sm:w-64"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(qInput);
          }}
        >
          <Input
            placeholder="Search…"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            onBlur={() => setQ(qInput)}
          />
        </form>
      </div>

      {list.isLoading && <Spinner />}
      {list.isError && <ErrorBanner message={errorMessage(list.error)} />}

      {list.data && (
        <Card className="p-0">
          <table className="w-full text-sm">
            <tbody>
              {list.data.items.map((post) => (
                <tr key={post.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                  <td className="px-4 py-2">
                    <Link to={`${basePath}/${post.id}`} className="font-medium hover:underline">
                      {post.title || "(untitled)"}
                    </Link>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-zinc-500 dark:text-zinc-400">{post.slug}</td>
                  <td className="px-4 py-2">
                    <StatusPill status={post.status} />
                  </td>
                  <td className="px-4 py-2 text-right text-zinc-500 dark:text-zinc-400">
                    {relativeTime(post.updatedAt)}
                  </td>
                </tr>
              ))}
              {list.data.items.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-zinc-500 dark:text-zinc-400" colSpan={4}>
                    No {heading.toLowerCase()} found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
