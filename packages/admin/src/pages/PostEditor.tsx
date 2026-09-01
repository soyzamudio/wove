import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { marked } from "marked";
import type { Post } from "@agentpress/sdk";
import { streamAi, useInvalidateTool, useToolMutation, useToolQuery } from "../api";
import { slugify } from "../lib/slug";
import { relativeTime } from "../lib/time";
import { useToast } from "../context/ToastContext";
import { Button, Card, ErrorBanner, Input, Label, Spinner, Textarea, errorMessage } from "../components/ui";

type Status = "draft" | "published" | "scheduled";

const REWRITE_CHIPS = ["Make it shorter", "Fix grammar", "More formal", "Add a summary"];

function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(local: string): string | undefined {
  if (!local) return undefined;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export function PostEditor({ postType }: { postType: "post" | "page" }) {
  const { id } = useParams<{ id: string }>();
  const isCreate = !id || id === "new";
  const navigate = useNavigate();
  const toast = useToast();
  const invalidate = useInvalidateTool();
  const basePath = postType === "post" ? "/posts" : "/pages";
  const noun = postType === "post" ? "post" : "page";

  const postQuery = useToolQuery("post.get", { id: id ?? "" }, { enabled: !isCreate });
  const categoriesQuery = useToolQuery("term.list", { taxonomy: "category" });

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [status, setStatus] = useState<Status>("draft");
  const [publishedAtLocal, setPublishedAtLocal] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [category, setCategory] = useState("");
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [showRevisions, setShowRevisions] = useState(false);

  // ---- AI: draft / rewrite -------------------------------------------------
  const aiConfigQuery = useToolQuery("ai.config", {});
  const aiConfigured = !!aiConfigQuery.data && aiConfigQuery.data.keySource !== "none";

  const contentRef = useRef<HTMLTextAreaElement>(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const hasSelection = selection.end > selection.start;

  function trackSelection() {
    const el = contentRef.current;
    if (!el) return;
    setSelection({ start: el.selectionStart, end: el.selectionEnd });
  }

  const [showDraft, setShowDraft] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState("");
  const [drafting, setDrafting] = useState(false);
  const draftAbortRef = useRef<AbortController | null>(null);

  function startDraft() {
    if (!draftPrompt.trim() || drafting) return;
    const hasExistingContent = content.trim().length > 0;
    const insertPos = hasExistingContent ? (contentRef.current?.selectionStart ?? content.length) : 0;
    const prefix = hasExistingContent ? content.slice(0, insertPos) : "";
    const suffix = hasExistingContent ? content.slice(insertPos) : "";
    let acc = "";
    const controller = new AbortController();
    draftAbortRef.current = controller;
    setDrafting(true);
    streamAi(
      { kind: "generate", prompt: draftPrompt, postId: isCreate ? undefined : id },
      {
        signal: controller.signal,
        onToken: (t) => {
          acc += t;
          setContent(prefix + acc + suffix);
        },
        onDone: (info) => {
          setDrafting(false);
          draftAbortRef.current = null;
          toast.success(`Generated ${info.usage.outputTokens} tokens (${info.model})`);
        },
        onError: (e) => {
          setDrafting(false);
          draftAbortRef.current = null;
          toast.error(e.message);
        },
      }
    );
  }

  function stopDraft() {
    draftAbortRef.current?.abort();
    draftAbortRef.current = null;
    setDrafting(false);
  }

  const [showRewrite, setShowRewrite] = useState(false);
  const [rewriteInstruction, setRewriteInstruction] = useState("");
  const [rewriting, setRewriting] = useState(false);
  const rewriteAbortRef = useRef<AbortController | null>(null);

  function startRewrite(instruction: string) {
    const text = instruction.trim();
    if (!text || rewriting) return;
    const { start, end } = selection;
    const selectedText = content.slice(start, end);
    if (!selectedText) return;
    let acc = "";
    const controller = new AbortController();
    rewriteAbortRef.current = controller;
    setRewriting(true);
    streamAi(
      { kind: "rewrite", text: selectedText, instruction: text },
      {
        signal: controller.signal,
        onToken: (t) => {
          // Accumulate only — replace the selection once on done rather than fighting the caret mid-stream.
          acc += t;
        },
        onDone: (info) => {
          setContent((cur) => cur.slice(0, start) + acc + cur.slice(end));
          setRewriting(false);
          rewriteAbortRef.current = null;
          setShowRewrite(false);
          setRewriteInstruction("");
          toast.success(`Rewrote selection (${info.usage.outputTokens} tokens)`);
        },
        onError: (e) => {
          setRewriting(false);
          rewriteAbortRef.current = null;
          toast.error(e.message);
        },
      }
    );
  }

  function stopRewrite() {
    rewriteAbortRef.current?.abort();
    rewriteAbortRef.current = null;
    setRewriting(false);
  }

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(title));
  }, [title, slugTouched]);

  // Populate form from loaded post (edit mode), once per post id.
  useEffect(() => {
    const post = postQuery.data;
    if (!post || post.id === loadedId) return;
    setTitle(post.title);
    setSlug(post.slug);
    setSlugTouched(true);
    setStatus(post.status);
    setPublishedAtLocal(isoToLocalInput(post.publishedAt));
    setExcerpt(post.excerpt ?? "");
    setContent(post.content ?? "");
    setTagsInput(post.terms.filter((t) => t.taxonomy === "tag").map((t) => t.name).join(", "));
    setCategory(post.terms.find((t) => t.taxonomy === "category")?.name ?? "");
    setLoadedId(post.id);
  }, [postQuery.data, loadedId]);

  const html = useMemo(() => {
    try {
      const result = marked.parse(content, { async: false } as any);
      return typeof result === "string" ? result : "";
    } catch {
      return "";
    }
  }, [content]);

  const createMutation = useToolMutation("post.create");
  const updateMutation = useToolMutation("post.update");
  const publishMutation = useToolMutation("post.publish");
  const deleteMutation = useToolMutation("post.delete");
  const revisionsQuery = useToolQuery("post.revisions", { id: id ?? "" }, { enabled: false });

  function buildTerms() {
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .map((name) => ({ taxonomy: "tag", name }));
    const categories = category.trim() ? [{ taxonomy: "category", name: category.trim() }] : [];
    return [...tags, ...categories];
  }

  function handleSave() {
    const publishedAt = localInputToIso(publishedAtLocal);
    if (isCreate) {
      createMutation.mutate(
        {
          type: postType,
          slug,
          title,
          content,
          excerpt: excerpt || undefined,
          status,
          publishedAt,
          terms: buildTerms(),
        },
        {
          onSuccess: (created: Post) => {
            toast.success(`${noun} created`);
            invalidate("post.list");
            invalidate("post.get");
            navigate(`${basePath}/${created.id}`, { replace: true });
          },
          onError: (err) => toast.error(errorMessage(err)),
        }
      );
    } else {
      updateMutation.mutate(
        {
          id: id!,
          slug,
          title,
          content,
          excerpt: excerpt || undefined,
          status,
          publishedAt,
          terms: buildTerms(),
        },
        {
          onSuccess: () => {
            toast.success(`${noun} saved`);
            invalidate("post.list");
            invalidate("post.get");
          },
          onError: (err) => toast.error(errorMessage(err)),
        }
      );
    }
  }

  function handlePublish() {
    if (!id) return;
    publishMutation.mutate(
      { id },
      {
        onSuccess: (updated: Post) => {
          toast.success(`${noun} published`);
          setStatus(updated.status);
          setPublishedAtLocal(isoToLocalInput(updated.publishedAt));
          invalidate("post.list");
          invalidate("post.get");
        },
        onError: (err) => toast.error(errorMessage(err)),
      }
    );
  }

  function handleDelete() {
    if (!id) return;
    if (!window.confirm(`Delete this ${noun}?`)) return;
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          toast.success(`${noun} deleted`);
          invalidate("post.list");
          navigate(basePath);
        },
        onError: (err) => toast.error(errorMessage(err)),
      }
    );
  }

  function toggleRevisions() {
    const next = !showRevisions;
    setShowRevisions(next);
    if (next) revisionsQuery.refetch();
  }

  function restoreRevision(rev: { title: string; content: string }) {
    setTitle(rev.title);
    setContent(rev.content);
    toast.push("info", "Revision loaded into editor — click Save to persist.");
  }

  const saving = createMutation.isPending || updateMutation.isPending;

  if (!isCreate && postQuery.isLoading) return <Spinner />;
  if (!isCreate && postQuery.isError) return <ErrorBanner message={errorMessage(postQuery.error)} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {isCreate ? `New ${noun}` : `Edit ${noun}`}
        </h1>
        <div className="flex gap-2">
          {!isCreate && (
            <Button variant="secondary" onClick={toggleRevisions}>
              Revisions
            </Button>
          )}
          {!isCreate && status !== "published" && (
            <Button variant="secondary" disabled={publishMutation.isPending} onClick={handlePublish}>
              Publish
            </Button>
          )}
          {!isCreate && (
            <Button variant="danger" disabled={deleteMutation.isPending} onClick={handleDelete}>
              Delete
            </Button>
          )}
          <Button variant="primary" disabled={saving} onClick={handleSave}>
            Save
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Card>
        <Card>
          <Label>Slug</Label>
          <Input
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
          />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <Label>Status</Label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="scheduled">Scheduled</option>
          </select>
        </Card>
        <Card>
          <Label>Published at</Label>
          <input
            type="datetime-local"
            value={publishedAtLocal}
            onChange={(e) => setPublishedAtLocal(e.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </Card>
        <Card>
          <Label>Excerpt</Label>
          <Input value={excerpt} onChange={(e) => setExcerpt(e.target.value)} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <Label>Tags (comma-separated)</Label>
          <Input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="tag-one, tag-two" />
        </Card>
        <Card>
          <Label>Category</Label>
          <Input value={category} onChange={(e) => setCategory(e.target.value)} list="category-suggestions" />
          <datalist id="category-suggestions">
            {(categoriesQuery.data ?? []).map((term) => (
              <option key={term.id} value={term.name} />
            ))}
          </datalist>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <Label>Content (markdown)</Label>
            <div className="flex flex-wrap items-center gap-2">
              {aiConfigured ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={drafting || rewriting}
                    onClick={() => {
                      setShowDraft((v) => !v);
                      setShowRewrite(false);
                    }}
                  >
                    Draft with AI
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!hasSelection || drafting || rewriting}
                    onClick={() => {
                      setShowRewrite((v) => !v);
                      setShowDraft(false);
                    }}
                    title={hasSelection ? undefined : "Select some text in the content to rewrite it"}
                  >
                    Rewrite selection
                  </Button>
                </>
              ) : (
                <Link
                  to="/settings"
                  className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
                  title="AI is not configured yet"
                >
                  Configure AI in Settings
                </Link>
              )}
            </div>
          </div>

          {showDraft && (
            <div className="mb-3 space-y-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
              <Label>Prompt</Label>
              <Textarea
                rows={3}
                value={draftPrompt}
                onChange={(e) => setDraftPrompt(e.target.value)}
                placeholder="What should the AI write about?"
                disabled={drafting}
              />
              <div className="flex gap-2">
                {!drafting ? (
                  <Button type="button" variant="primary" disabled={!draftPrompt.trim()} onClick={startDraft}>
                    Generate
                  </Button>
                ) : (
                  <Button type="button" variant="danger" onClick={stopDraft}>
                    Stop
                  </Button>
                )}
                <Button type="button" variant="secondary" disabled={drafting} onClick={() => setShowDraft(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}

          {showRewrite && (
            <div className="mb-3 space-y-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
              <Label>Rewrite instruction</Label>
              <div className="flex flex-wrap gap-1.5">
                {REWRITE_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    disabled={rewriting}
                    onClick={() => setRewriteInstruction(chip)}
                    className="rounded-full border border-zinc-300 px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    {chip}
                  </button>
                ))}
              </div>
              <Input
                value={rewriteInstruction}
                onChange={(e) => setRewriteInstruction(e.target.value)}
                placeholder="e.g. Make it shorter"
                disabled={rewriting}
              />
              <div className="flex gap-2">
                {!rewriting ? (
                  <Button
                    type="button"
                    variant="primary"
                    disabled={!rewriteInstruction.trim() || !hasSelection}
                    onClick={() => startRewrite(rewriteInstruction)}
                  >
                    Rewrite
                  </Button>
                ) : (
                  <Button type="button" variant="danger" onClick={stopRewrite}>
                    Stop
                  </Button>
                )}
                <Button type="button" variant="secondary" disabled={rewriting} onClick={() => setShowRewrite(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}

          <textarea
            ref={contentRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onSelect={trackSelection}
            onKeyUp={trackSelection}
            onMouseUp={trackSelection}
            rows={20}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </Card>
        <Card>
          <Label>Preview</Label>
          <div
            className="prose prose-sm max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </Card>
      </div>

      {showRevisions && (
        <div className="fixed inset-y-0 right-0 z-40 w-full max-w-sm overflow-y-auto border-l border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Revisions</h2>
            <Button variant="secondary" onClick={() => setShowRevisions(false)}>
              Close
            </Button>
          </div>
          {revisionsQuery.isLoading && <Spinner />}
          {revisionsQuery.isError && <ErrorBanner message={errorMessage(revisionsQuery.error)} />}
          <div className="space-y-2">
            {(revisionsQuery.data ?? []).map((rev) => (
              <Card key={rev.id}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-medium">{rev.title || "(untitled)"}</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">{relativeTime(rev.ts)}</span>
                </div>
                <Button variant="secondary" onClick={() => restoreRevision(rev)}>
                  Restore
                </Button>
              </Card>
            ))}
            {revisionsQuery.data && revisionsQuery.data.length === 0 && (
              <div className="text-sm text-zinc-500 dark:text-zinc-400">No revisions yet.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
