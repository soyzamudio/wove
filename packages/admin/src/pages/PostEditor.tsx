import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ExternalLink, History, MoreHorizontal, Sparkles, Trash2 } from "lucide-react";
import type { ImageRef, Post } from "@wove/sdk";
import { streamAi, useInvalidateTool, useToolMutation, useToolQuery } from "../api";
import { slugify } from "../lib/slug";
import { relativeTime } from "../lib/time";
import { draftKey } from "../lib/draftRecovery";
import { useDraftRecovery } from "../hooks/useDraftRecovery";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import { canReview, editorStatusOptions } from "../lib/roles";
import {
  EMPTY_SEO,
  ImageRefField,
  PendingReviewBanner,
  RecoveryBanner,
  SeoSection,
  TrashedBanner,
  seoFromPost,
  seoToInput,
  type SeoState,
} from "../components/editor";
import {
  Button,
  Card,
  ErrorBanner,
  Input,
  Label,
  PageHeader,
  Select,
  SlideOver,
  Spinner,
  Textarea,
  errorMessage,
} from "../components/ui";
import {
  RichMarkdownEditor,
  type RichMarkdownEditorHandle,
  type RichSelection,
} from "../components/RichMarkdownEditor";

type Status = "draft" | "pending" | "published" | "scheduled";

/** AI streams faster than a ProseMirror re-parse is worth doing; ~4 repaints/s. */
const STREAM_REPAINT_MS = 250;

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
  const siteQuery = useToolQuery("site.info", {});
  const { role, can } = useAuth();
  // Only admins can list users; editors fall back to the raw author id in the review banner.
  const usersQuery = useToolQuery(
    "user.list",
    {},
    { enabled: can(["users:manage"]) && postQuery.data?.status === "pending", retry: false }
  );

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [status, setStatus] = useState<Status>("draft");
  const [publishedAtLocal, setPublishedAtLocal] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [category, setCategory] = useState("");
  const [featuredImage, setFeaturedImage] = useState<ImageRef | null>(null);
  const [seo, setSeo] = useState<SeoState>(EMPTY_SEO);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [showRevisions, setShowRevisions] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // ---- AI: draft / rewrite -------------------------------------------------
  const aiConfigQuery = useToolQuery("ai.config", {});
  const aiConfigured = !!aiConfigQuery.data && aiConfigQuery.data.keySource !== "none";

  const editorRef = useRef<RichMarkdownEditorHandle>(null);
  const [selection, setSelection] = useState<RichSelection | null>(null);
  const hasSelection = !!selection && selection.text.trim().length > 0;

  const [showDraft, setShowDraft] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState("");
  const [drafting, setDrafting] = useState(false);
  const draftAbortRef = useRef<AbortController | null>(null);

  function startDraft() {
    if (!draftPrompt.trim() || drafting) return;
    // Stream into the end of whatever is already written; the editor re-parses
    // the whole markdown string, so we repaint on a timer instead of per token.
    const base = editorRef.current?.getMarkdown() ?? content;
    const prefix = base.trim() ? (base.endsWith("\n") ? base : base + "\n\n") : "";
    let acc = "";
    let painted = 0;
    const paint = () => {
      painted = Date.now();
      editorRef.current?.setMarkdown(prefix + acc);
      setContent(prefix + acc);
    };
    const controller = new AbortController();
    draftAbortRef.current = controller;
    setDrafting(true);
    streamAi(
      { kind: "generate", prompt: draftPrompt, postId: isCreate ? undefined : id },
      {
        signal: controller.signal,
        onToken: (t) => {
          acc += t;
          if (Date.now() - painted >= STREAM_REPAINT_MS) paint();
        },
        onDone: (info) => {
          paint();
          setDrafting(false);
          draftAbortRef.current = null;
          toast.success(`Generated ${info.usage.outputTokens} tokens (${info.model})`);
        },
        onError: (e) => {
          paint();
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
    const selectedText = selection?.text ?? "";
    if (!selectedText.trim()) return;
    let acc = "";
    const controller = new AbortController();
    rewriteAbortRef.current = controller;
    setRewriting(true);
    streamAi(
      { kind: "rewrite", text: selectedText, instruction: text },
      {
        signal: controller.signal,
        onToken: (t) => {
          // Accumulate only — swap the selection once on done rather than
          // fighting the caret mid-stream.
          acc += t;
        },
        onDone: (info) => {
          editorRef.current?.replaceSelection(acc);
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

  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  // Populate form from loaded post (edit mode), once per post id.
  useEffect(() => {
    const post = postQuery.data;
    if (!post || post.id === loadedId) return;
    setTitle(post.title);
    setSlug(post.slug);
    setSlugTouched(true);
    // "trashed" isn't an option in the Status select; the trash banner handles it.
    setStatus(post.status === "trashed" ? "draft" : post.status);
    setPublishedAtLocal(isoToLocalInput(post.publishedAt));
    setExcerpt(post.excerpt ?? "");
    setContent(post.content ?? "");
    setTagsInput(post.terms.filter((t) => t.taxonomy === "tag").map((t) => t.name).join(", "));
    setCategory(post.terms.find((t) => t.taxonomy === "category")?.name ?? "");
    setFeaturedImage(post.featuredImage ?? null);
    setSeo(seoFromPost(post));
    setLoadedId(post.id);
  }, [postQuery.data, loadedId]);

  // ---- autosave / recovery -------------------------------------------------
  const formState = useMemo(
    () => ({ title, slug, status, publishedAtLocal, excerpt, content, tagsInput, category, featuredImage, seo }),
    [title, slug, status, publishedAtLocal, excerpt, content, tagsInput, category, featuredImage, seo]
  );
  type FormState = typeof formState;

  const recovery = useDraftRecovery<FormState>(draftKey(id, postType), formState, {
    // Only start writing once the server copy is in (or immediately for a new post).
    enabled: isCreate || loadedId !== null,
    serverUpdatedAt: postQuery.data?.updatedAt ?? null,
  });

  function applyRecovered(data: FormState) {
    setTitle(data.title);
    setSlug(data.slug);
    setSlugTouched(true);
    setStatus(data.status);
    setPublishedAtLocal(data.publishedAtLocal);
    setExcerpt(data.excerpt);
    setContent(data.content);
    setTagsInput(data.tagsInput);
    setCategory(data.category);
    setFeaturedImage(data.featuredImage ?? null);
    setSeo(data.seo ?? EMPTY_SEO);
  }

  const createMutation = useToolMutation("post.create");
  const updateMutation = useToolMutation("post.update");
  const publishMutation = useToolMutation("post.publish");
  const submitMutation = useToolMutation("post.update");
  const deleteMutation = useToolMutation("post.delete");
  const restoreMutation = useToolMutation("post.restore");
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
          featuredImage,
          seo: seoToInput(seo),
        },
        {
          onSuccess: (created: Post) => {
            recovery.clear();
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
          featuredImage,
          seo: seoToInput(seo),
        },
        {
          onSuccess: () => {
            recovery.clear();
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
          setStatus(updated.status === "trashed" ? "draft" : updated.status);
          setPublishedAtLocal(isoToLocalInput(updated.publishedAt));
          invalidate("post.list");
          invalidate("post.get");
        },
        onError: (err) => toast.error(errorMessage(err)),
      }
    );
  }

  /** Move a post between draft and pending review (submit / send back). */
  function setReviewStatus(next: "draft" | "pending") {
    if (!id) return;
    submitMutation.mutate(
      { id, status: next },
      {
        onSuccess: () => {
          setStatus(next);
          toast.success(next === "pending" ? "Submitted for review" : `${noun} sent back to draft`);
          invalidate("post.list");
          invalidate("post.get");
        },
        onError: (err) => toast.error(errorMessage(err)),
      }
    );
  }

  /** Delete now means "move to trash", with a one-click undo. */
  function handleTrash() {
    if (!id) return;
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          recovery.clear();
          invalidate("post.list");
          invalidate("post.get");
          toast.success("Moved to trash", {
            label: "Undo",
            onClick: () =>
              restoreMutation.mutate(
                { id },
                {
                  onSuccess: () => {
                    toast.success(`${noun} restored`);
                    invalidate("post.list");
                    invalidate("post.get");
                  },
                  onError: (err) => toast.error(errorMessage(err)),
                }
              ),
          });
          navigate(basePath);
        },
        onError: (err) => toast.error(errorMessage(err)),
      }
    );
  }

  function handleRestore() {
    if (!id) return;
    restoreMutation.mutate(
      { id },
      {
        onSuccess: (updated: Post) => {
          toast.success(`${noun} restored`);
          setStatus(updated.status === "trashed" ? "draft" : updated.status);
          invalidate("post.list");
          invalidate("post.get");
        },
        onError: (err) => toast.error(errorMessage(err)),
      }
    );
  }

  function handleDeleteForever() {
    if (!id) return;
    if (!window.confirm(`Permanently delete this ${noun}? This cannot be undone.`)) return;
    deleteMutation.mutate(
      { id, permanent: true },
      {
        onSuccess: () => {
          recovery.clear();
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
  const isTrashed = postQuery.data?.status === "trashed";
  const isPending = postQuery.data?.status === "pending";
  const isReviewer = canReview(role);
  const isContributor = role === "contributor";
  const authorLabel = usersQuery.data?.find((u) => u.id === postQuery.data?.authorId)?.name
    || postQuery.data?.authorId
    || "someone";
  const siteUrl = (siteQuery.data?.settings.siteUrl ?? "").replace(/\/$/, "");
  const publicUrl = siteUrl && slug ? `${siteUrl}/${slug}` : "";

  if (!isCreate && postQuery.isLoading) return <Spinner />;
  if (!isCreate && postQuery.isError) return <ErrorBanner message={errorMessage(postQuery.error)} />;

  const aiPanel = (
    <div className="space-y-3">
      {aiConfigured ? (
        <>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={drafting || rewriting}
              onClick={() => {
                setShowDraft((v) => !v);
                setShowRewrite(false);
              }}
            >
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              Draft with AI
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!hasSelection || drafting || rewriting}
              onClick={() => {
                setShowRewrite((v) => !v);
                setShowDraft(false);
              }}
              title={hasSelection ? undefined : "Select some text in the content to rewrite it"}
            >
              Rewrite selection
            </Button>
          </div>

          {showDraft && (
            <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
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
                  <Button type="button" variant="primary" size="sm" disabled={!draftPrompt.trim()} onClick={startDraft}>
                    Generate
                  </Button>
                ) : (
                  <Button type="button" variant="danger" size="sm" onClick={stopDraft}>
                    Stop
                  </Button>
                )}
                <Button type="button" variant="ghost" size="sm" disabled={drafting} onClick={() => setShowDraft(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}

          {showRewrite && (
            <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
              <Label>Rewrite instruction</Label>
              <div className="flex flex-wrap gap-1.5">
                {REWRITE_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    disabled={rewriting}
                    onClick={() => setRewriteInstruction(chip)}
                    className="rounded-full border border-zinc-300 px-2 py-0.5 text-xs text-zinc-600 transition-colors hover:border-blue-400 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:text-blue-400"
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
                    size="sm"
                    disabled={!rewriteInstruction.trim() || !hasSelection}
                    onClick={() => startRewrite(rewriteInstruction)}
                  >
                    Rewrite
                  </Button>
                ) : (
                  <Button type="button" variant="danger" size="sm" onClick={stopRewrite}>
                    Stop
                  </Button>
                )}
                <Button type="button" variant="ghost" size="sm" disabled={rewriting} onClick={() => setShowRewrite(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <Link
          to="/settings"
          className="text-xs text-blue-600 hover:underline dark:text-blue-400"
          title="AI is not configured yet"
        >
          Configure AI in Settings →
        </Link>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader
        title={isCreate ? `New ${noun}` : `Edit ${noun}: ${title || "(untitled)"}`}
        actions={
          <>
            {!isCreate && status === "published" && publicUrl && (
              <a href={publicUrl} target="_blank" rel="noreferrer">
                <Button variant="secondary">
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  Visit
                </Button>
              </a>
            )}
            {!isCreate && (
              <Button variant="secondary" disabled={saving} onClick={handleSave}>
                {status === "published" ? "Save" : "Save draft"}
              </Button>
            )}
            {isCreate ? (
              <Button variant="primary" disabled={saving} onClick={handleSave}>
                {saving ? "Saving…" : "Save"}
              </Button>
            ) : status === "published" ? (
              <Button variant="primary" disabled={saving} onClick={handleSave}>
                {saving ? "Saving…" : "Update"}
              </Button>
            ) : isContributor ? (
              status === "pending" ? (
                <Button variant="secondary" disabled>
                  Submitted — awaiting review
                </Button>
              ) : (
                <Button
                  variant="primary"
                  disabled={submitMutation.isPending}
                  onClick={() => setReviewStatus("pending")}
                >
                  {submitMutation.isPending ? "Submitting…" : "Submit for review"}
                </Button>
              )
            ) : (
              <Button variant="primary" disabled={publishMutation.isPending} onClick={handlePublish}>
                {publishMutation.isPending ? "Publishing…" : "Publish"}
              </Button>
            )}
            {!isCreate && (
              <div className="relative" ref={menuRef}>
                <Button
                  variant="ghost"
                  aria-label="More actions"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((v) => !v)}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
                {menuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        toggleRevisions();
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                    >
                      <History className="h-3.5 w-3.5" aria-hidden="true" />
                      Revisions
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        setMenuOpen(false);
                        handleTrash();
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/50"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Move to trash
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        }
      />

      {isPending && isReviewer && (
        <PendingReviewBanner
          noun={noun.toLowerCase()}
          submittedBy={authorLabel}
          busy={publishMutation.isPending || submitMutation.isPending}
          onApprove={handlePublish}
          onBackToDraft={() => setReviewStatus("draft")}
        />
      )}

      {isTrashed && (
        <TrashedBanner
          noun={noun}
          busy={restoreMutation.isPending || deleteMutation.isPending}
          onRestore={handleRestore}
          onDeleteForever={handleDeleteForever}
        />
      )}

      {recovery.recoveredAt && (
        <RecoveryBanner
          savedAt={recovery.recoveredAt}
          onRestore={() => {
            const data = recovery.restore();
            if (data) applyRecovered(data);
          }}
          onDiscard={recovery.discard}
        />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Title"
            placeholder={`Add a ${noun} title…`}
            className="w-full border-0 bg-transparent px-0 text-3xl font-semibold tracking-tight text-zinc-900 placeholder:text-zinc-300 focus:outline-none dark:text-zinc-100 dark:placeholder:text-zinc-700"
          />

          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Content
            </span>
          </div>

          <RichMarkdownEditor
            ref={editorRef}
            value={content}
            onChange={setContent}
            onSelectionChange={setSelection}
            variant="full"
            surfaceId={`post-content-${postType}`}
            placeholder={`Write your ${noun}… Markdown shortcuts work: # heading, - list, > quote.`}
            ariaLabel="Content"
          />
        </div>

        <aside className="space-y-4">
          <Card className="space-y-3">
            <div>
              <Label htmlFor="post-status">Status</Label>
              <Select id="post-status" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
                {editorStatusOptions(role, status).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="post-slug">Slug</Label>
              <Input
                id="post-slug"
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value);
                }}
              />
            </div>
            <div>
              <Label htmlFor="post-published-at">Publish date</Label>
              <Input
                id="post-published-at"
                type="datetime-local"
                value={publishedAtLocal}
                onChange={(e) => setPublishedAtLocal(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="post-excerpt">Excerpt</Label>
              <Textarea id="post-excerpt" rows={3} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="post-tags">Tags (comma-separated)</Label>
              <Input
                id="post-tags"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="tag-one, tag-two"
              />
            </div>
            <div>
              <Label htmlFor="post-category">Category</Label>
              <Input
                id="post-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                list="category-suggestions"
              />
              <datalist id="category-suggestions">
                {(categoriesQuery.data ?? []).map((term) => (
                  <option key={term.id} value={term.name} />
                ))}
              </datalist>
            </div>
          </Card>

          <Card>
            <ImageRefField label="Featured image" value={featuredImage} onChange={setFeaturedImage} />
          </Card>

          <SeoSection
            seo={seo}
            onChange={setSeo}
            postTitle={title}
            slug={slug}
            excerpt={excerpt}
            siteUrl={siteQuery.data?.settings.siteUrl}
          />

          <Card>
            <div className="mb-2 flex items-center gap-1.5 text-base font-semibold tracking-tight">
              <Sparkles className="h-4 w-4 text-blue-600" aria-hidden="true" />
              AI
            </div>
            {aiPanel}
          </Card>
        </aside>
      </div>

      <SlideOver open={showRevisions} onClose={() => setShowRevisions(false)} title="Revisions">
        {revisionsQuery.isLoading && <Spinner />}
        {revisionsQuery.isError && <ErrorBanner message={errorMessage(revisionsQuery.error)} />}
        <div className="space-y-2">
          {(revisionsQuery.data ?? []).map((rev) => (
            <Card key={rev.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{rev.title || "(untitled)"}</div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">{relativeTime(rev.ts)}</div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => restoreRevision(rev)}>
                Restore
              </Button>
            </Card>
          ))}
          {revisionsQuery.data && revisionsQuery.data.length === 0 && (
            <div className="text-sm text-zinc-500 dark:text-zinc-400">No revisions yet.</div>
          )}
        </div>
      </SlideOver>
    </div>
  );
}
