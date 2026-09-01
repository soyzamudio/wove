import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  ExternalLink,
  FileCode2,
  History,
  LayoutTemplate,
  Monitor,
  MoreHorizontal,
  Plus,
  Redo2,
  Smartphone,
  Sparkles,
  Trash2,
  Undo2,
} from "lucide-react";
import { BlockMeta, newBlock, type BlocksDoc } from "@wove/blocks";
import { designToCssVars, type ImageRef, type Post } from "@wove/sdk";
import { useInvalidateTool, useToolMutation, useToolQuery } from "../api";
import { useBuilderState } from "../hooks/useBuilderState";
import { useDraftRecovery } from "../hooks/useDraftRecovery";
import { emptyBuilderDoc, type BuilderBlock } from "../lib/builderState";
import { slugify } from "../lib/slug";
import { relativeTime } from "../lib/time";
import { draftKey } from "../lib/draftRecovery";
import { useToast } from "../context/ToastContext";
import {
  EMPTY_SEO,
  ImageRefField,
  RecoveryBanner,
  SeoSection,
  TrashedBanner,
  seoFromPost,
  seoToInput,
  type SeoState,
} from "../components/editor";
import { AddBlockPicker } from "../components/AddBlockPicker";
import { AddBlockGap, BlockFrame, CanvasSheet } from "../components/BlockFrame";
import { PropsForm } from "../components/PropsForm";
import {
  Button,
  Card,
  ErrorBanner,
  IconButton,
  Input,
  Label,
  PageHeader,
  Select,
  SlideOver,
  Spinner,
  Tabs,
  Textarea,
  cx,
  errorMessage,
} from "../components/ui";

type Status = "draft" | "published" | "scheduled";
type Rail = "page" | "block";
type Preview = "desktop" | "mobile";

const MOBILE_WIDTH = 390;

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

const TEMPLATES: Array<{ key: string; label: string; types: Array<Parameters<typeof newBlock>[0]> }> = [
  { key: "landing", label: "Landing page", types: ["hero", "features", "testimonials", "cta"] },
  { key: "about", label: "About", types: ["hero", "markdown", "stats"] },
  { key: "blank", label: "Blank", types: ["hero"] },
];

function buildTemplate(key: string): BuilderBlock[] {
  const template = TEMPLATES.find((t) => t.key === key) ?? TEMPLATES[2]!;
  const blocks = template.types.map((type) => newBlock(type) as BuilderBlock);
  if (key === "about" && blocks[0]?.type === "hero") {
    (blocks[0].props as { layout: string }).layout = "centered";
  }
  return blocks;
}

export function PageBuilder() {
  const { id } = useParams<{ id: string }>();
  const isCreate = !id || id === "new";
  const navigate = useNavigate();
  const toast = useToast();
  const invalidate = useInvalidateTool();

  const postQuery = useToolQuery("post.get", { id: id ?? "" }, { enabled: !isCreate });
  const siteQuery = useToolQuery("site.info", {});
  const categoriesQuery = useToolQuery("term.list", { taxonomy: "category" });
  const designQuery = useToolQuery("design.get", {});

  const builder = useBuilderState(emptyBuilderDoc());

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [status, setStatus] = useState<Status>("draft");
  const [publishedAtLocal, setPublishedAtLocal] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [category, setCategory] = useState("");
  const [featuredImage, setFeaturedImage] = useState<ImageRef | null>(null);
  const [seo, setSeo] = useState<SeoState>(EMPTY_SEO);
  const [format, setFormat] = useState<"markdown" | "blocks">("blocks");
  const [markdownContent, setMarkdownContent] = useState("");
  const [metaDirty, setMetaDirty] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  const [rail, setRail] = useState<Rail>("page");
  const [preview, setPreview] = useState<Preview>("desktop");
  const [pickerAt, setPickerAt] = useState<number | null>(null);
  const [showRevisions, setShowRevisions] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [pagePrompt, setPagePrompt] = useState("");
  const [blockInstruction, setBlockInstruction] = useState("");

  const dirty = builder.dirty || metaDirty;

  // ---- load ---------------------------------------------------------------
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
    setTagsInput(post.terms.filter((t) => t.taxonomy === "tag").map((t) => t.name).join(", "));
    setCategory(post.terms.find((t) => t.taxonomy === "category")?.name ?? "");
    setFeaturedImage(post.featuredImage ?? null);
    setSeo(seoFromPost(post));
    setFormat(post.format);
    setMarkdownContent(post.format === "markdown" ? (post.content ?? "") : "");
    builder.reset(post.blocks ?? emptyBuilderDoc());
    setMetaDirty(false);
    setLoadedId(post.id);
  }, [postQuery.data, loadedId, builder]);

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

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // ---- autosave / recovery -------------------------------------------------
  const formState = useMemo(
    () => ({
      title,
      slug,
      status,
      publishedAtLocal,
      excerpt,
      tagsInput,
      category,
      featuredImage,
      seo,
      doc: builder.doc,
    }),
    [title, slug, status, publishedAtLocal, excerpt, tagsInput, category, featuredImage, seo, builder.doc]
  );
  type FormState = typeof formState;

  const recovery = useDraftRecovery<FormState>(draftKey(id, "page"), formState, {
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
    setTagsInput(data.tagsInput);
    setCategory(data.category);
    setFeaturedImage(data.featuredImage ?? null);
    setSeo(data.seo ?? EMPTY_SEO);
    if (data.doc?.blocks) builder.replaceAll(data.doc.blocks as BuilderBlock[]);
    setMetaDirty(true);
  }

  // ---- mutations ----------------------------------------------------------
  const createMutation = useToolMutation("post.create");
  const updateMutation = useToolMutation("post.update");
  const publishMutation = useToolMutation("post.publish");
  const deleteMutation = useToolMutation("post.delete");
  const restoreMutation = useToolMutation("post.restore");
  const revisionsQuery = useToolQuery("post.revisions", { id: id ?? "" }, { enabled: false });

  const generatePage = useToolMutation("ai.generatePage", {
    onSuccess: (result) => {
      builder.replaceAll(result.doc.blocks as BuilderBlock[]);
      if (!title.trim()) {
        setTitle(result.title);
        setMetaDirty(true);
      }
      setFormat("blocks");
      setPagePrompt("");
      toast.success(
        `Generated ${result.doc.blocks.length} blocks (${result.usage.inputTokens + result.usage.outputTokens} tokens)`
      );
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const editBlock = useToolMutation("ai.editBlock", {
    onSuccess: (result) => {
      if (builder.selectedId) builder.replaceBlock(builder.selectedId, result.block as BuilderBlock);
      setBlockInstruction("");
      toast.success(`Block updated (${result.usage.outputTokens} tokens)`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

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
    if (!title.trim()) {
      toast.error("Give the page a title first");
      setRail("page");
      return;
    }
    const publishedAt = localInputToIso(publishedAtLocal);
    const common = {
      slug,
      title,
      excerpt: excerpt || undefined,
      status,
      publishedAt,
      terms: buildTerms(),
      featuredImage,
      seo: seoToInput(seo),
      blocks: builder.doc as BlocksDoc,
    };
    if (isCreate) {
      createMutation.mutate(
        { type: "page", ...common },
        {
          onSuccess: (created: Post) => {
            recovery.clear();
            toast.success("page created");
            builder.markSaved();
            setMetaDirty(false);
            invalidate("post.list");
            invalidate("post.get");
            navigate(`/pages/${created.id}`, { replace: true });
          },
          onError: (err) => toast.error(errorMessage(err)),
        }
      );
    } else {
      updateMutation.mutate(
        { id: id!, ...common },
        {
          onSuccess: () => {
            recovery.clear();
            toast.success("page saved");
            builder.markSaved();
            setMetaDirty(false);
            setFormat("blocks");
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
          toast.success("page published");
          setStatus(updated.status === "trashed" ? "draft" : updated.status);
          setPublishedAtLocal(isoToLocalInput(updated.publishedAt));
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
                    toast.success("page restored");
                    invalidate("post.list");
                    invalidate("post.get");
                  },
                  onError: (err) => toast.error(errorMessage(err)),
                }
              ),
          });
          navigate("/pages");
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
          toast.success("page restored");
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
    if (!window.confirm("Permanently delete this page? This cannot be undone.")) return;
    deleteMutation.mutate(
      { id, permanent: true },
      {
        onSuccess: () => {
          recovery.clear();
          toast.success("page deleted");
          invalidate("post.list");
          navigate("/pages");
        },
        onError: (err) => toast.error(errorMessage(err)),
      }
    );
  }

  function convertToBlocks() {
    builder.replaceAll([
      { ...(newBlock("markdown") as BuilderBlock), props: { markdown: markdownContent, width: "content" } } as BuilderBlock,
    ]);
    setFormat("blocks");
    toast.push("info", "Converted to one Text block — Save to keep it.");
  }

  function generateFromPrompt() {
    if (!pagePrompt.trim()) return;
    if (builder.blocks.length > 0 && !window.confirm("Replace the current blocks with the generated page?")) return;
    generatePage.mutate({ prompt: pagePrompt, title: title.trim() || undefined });
  }

  // ---- dnd ----------------------------------------------------------------
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = builder.blocks.findIndex((b) => b.id === active.id);
    const to = builder.blocks.findIndex((b) => b.id === over.id);
    if (from < 0 || to < 0) return;
    builder.move(from, to);
  }

  const siteUrl = (siteQuery.data?.settings.siteUrl ?? "").replace(/\/$/, "");
  const publicUrl = siteUrl && slug ? `${siteUrl}/${slug}` : "";
  const saving = createMutation.isPending || updateMutation.isPending;
  const isTrashed = postQuery.data?.status === "trashed";
  // Preview the real site look on the canvas.
  const canvasVars = designQuery.data
    ? (designToCssVars(designQuery.data) as unknown as CSSProperties)
    : undefined;
  const sortableIds = useMemo(() => builder.blocks.map((b) => b.id), [builder.blocks]);

  if (!isCreate && postQuery.isLoading) return <Spinner />;
  if (!isCreate && postQuery.isError) return <ErrorBanner message={errorMessage(postQuery.error)} />;

  // ---- rail ---------------------------------------------------------------
  const pageTab = (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div>
          <Label htmlFor="page-title">Title</Label>
          <Input
            id="page-title"
            value={title}
            placeholder="Add a page title…"
            onChange={(e) => {
              setTitle(e.target.value);
              setMetaDirty(true);
            }}
          />
        </div>
        <div>
          <Label htmlFor="page-slug">Slug</Label>
          <Input
            id="page-slug"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
              setMetaDirty(true);
            }}
          />
        </div>
        <div>
          <Label htmlFor="page-status">Status</Label>
          <Select
            id="page-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as Status);
              setMetaDirty(true);
            }}
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="scheduled">Scheduled</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="page-published-at">Publish date</Label>
          <Input
            id="page-published-at"
            type="datetime-local"
            value={publishedAtLocal}
            onChange={(e) => {
              setPublishedAtLocal(e.target.value);
              setMetaDirty(true);
            }}
          />
        </div>
        <div>
          <Label htmlFor="page-excerpt">Excerpt</Label>
          <Textarea
            id="page-excerpt"
            rows={3}
            value={excerpt}
            onChange={(e) => {
              setExcerpt(e.target.value);
              setMetaDirty(true);
            }}
          />
        </div>
        <div>
          <Label htmlFor="page-tags">Tags (comma-separated)</Label>
          <Input
            id="page-tags"
            value={tagsInput}
            placeholder="tag-one, tag-two"
            onChange={(e) => {
              setTagsInput(e.target.value);
              setMetaDirty(true);
            }}
          />
        </div>
        <div>
          <Label htmlFor="page-category">Category</Label>
          <Input
            id="page-category"
            value={category}
            list="page-category-suggestions"
            onChange={(e) => {
              setCategory(e.target.value);
              setMetaDirty(true);
            }}
          />
          <datalist id="page-category-suggestions">
            {(categoriesQuery.data ?? []).map((term) => (
              <option key={term.id} value={term.name} />
            ))}
          </datalist>
        </div>
      </Card>

      <Card>
        <ImageRefField
          label="Featured image"
          value={featuredImage}
          onChange={(next) => {
            setFeaturedImage(next);
            setMetaDirty(true);
          }}
        />
      </Card>

      <SeoSection
        seo={seo}
        onChange={(next) => {
          setSeo(next);
          setMetaDirty(true);
        }}
        postTitle={title}
        slug={slug}
        excerpt={excerpt}
        siteUrl={siteQuery.data?.settings.siteUrl}
      />

      <Card>
        <div className="mb-2 flex items-center gap-1.5 text-base font-semibold tracking-tight">
          <Sparkles className="h-4 w-4 text-blue-600" aria-hidden="true" />
          Generate page from a prompt
        </div>
        <div className="space-y-2">
          <Textarea
            rows={4}
            value={pagePrompt}
            disabled={generatePage.isPending}
            placeholder="e.g. A landing page for a bike-repair studio in Lisbon…"
            onChange={(e) => setPagePrompt(e.target.value)}
          />
          <Button variant="primary" size="sm" disabled={generatePage.isPending || !pagePrompt.trim()} onClick={generateFromPrompt}>
            {generatePage.isPending ? "Generating…" : "Generate"}
          </Button>
        </div>
      </Card>
    </div>
  );

  const blockTab = builder.selected ? (
    <div className="space-y-4">
      <Card>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <div className="text-base font-semibold tracking-tight">{BlockMeta[builder.selected.type].name}</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">{BlockMeta[builder.selected.type].description}</div>
          </div>
        </div>
        <PropsForm
          type={builder.selected.type}
          value={builder.selected.props}
          onChange={(props) => builder.update(builder.selectedId!, props)}
        />
      </Card>

      <Card>
        <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold tracking-tight">
          <Sparkles className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
          AI edit
        </div>
        <div className="flex gap-2">
          <Input
            value={blockInstruction}
            disabled={editBlock.isPending}
            placeholder="Make the headline punchier…"
            onChange={(e) => setBlockInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && blockInstruction.trim() && builder.selected) {
                editBlock.mutate({ block: builder.selected as any, instruction: blockInstruction, postId: isCreate ? undefined : id });
              }
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={editBlock.isPending || !blockInstruction.trim()}
            onClick={() =>
              editBlock.mutate({ block: builder.selected as any, instruction: blockInstruction, postId: isCreate ? undefined : id })
            }
          >
            {editBlock.isPending ? "…" : "Apply"}
          </Button>
        </div>
      </Card>
    </div>
  ) : (
    <Card>
      <p className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">Select a block on the canvas</p>
    </Card>
  );

  // ---- canvas -------------------------------------------------------------
  const emptyCanvas = (
    <div className="flex items-center justify-center px-6 py-16">
      <Card className="w-full max-w-lg space-y-5">
        <div className="text-center">
          <div className="text-lg font-semibold tracking-tight">Start your page</div>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Describe it and let AI lay it out, or start from a template.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
            Generate with AI
          </div>
          <Textarea
            rows={3}
            value={pagePrompt}
            disabled={generatePage.isPending}
            placeholder="Describe the page you want…"
            onChange={(e) => setPagePrompt(e.target.value)}
          />
          <Button variant="primary" size="sm" disabled={generatePage.isPending || !pagePrompt.trim()} onClick={generateFromPrompt}>
            {generatePage.isPending ? "Generating…" : "Generate"}
          </Button>
        </div>

        <div className="space-y-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <LayoutTemplate className="h-3.5 w-3.5 text-zinc-500" aria-hidden="true" />
            Start from a template
          </div>
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map((t) => (
              <Button key={t.key} variant="secondary" size="sm" onClick={() => builder.replaceAll(buildTemplate(t.key))}>
                {t.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="border-t border-zinc-200 pt-4 text-center dark:border-zinc-800">
          <Button variant="ghost" size="sm" onClick={() => setPickerAt(0)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add block
          </Button>
        </div>
      </Card>
    </div>
  );

  return (
    <div>
      <PageHeader
        title={isCreate ? "New page" : `Edit page: ${title || "(untitled)"}`}
        subtitle={dirty ? "Unsaved changes" : undefined}
        actions={
          <>
            <div className="mr-1 inline-flex rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 dark:border-zinc-800 dark:bg-zinc-900">
              {([
                ["desktop", Monitor, "Desktop preview"],
                ["mobile", Smartphone, "Mobile preview"],
              ] as const).map(([value, Icon, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-label={label}
                  title={label}
                  aria-pressed={preview === value}
                  onClick={() => setPreview(value)}
                  className={cx(
                    "inline-flex h-7 w-8 items-center justify-center rounded-md transition-colors",
                    preview === value
                      ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                      : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>

            <IconButton label="Undo" disabled={!builder.canUndo} onClick={builder.undo}>
              <Undo2 className="h-4 w-4" />
            </IconButton>
            <IconButton label="Redo" disabled={!builder.canRedo} onClick={builder.redo}>
              <Redo2 className="h-4 w-4" />
            </IconButton>

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
                    className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        setShowRevisions(true);
                        revisionsQuery.refetch();
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                    >
                      <History className="h-3.5 w-3.5" aria-hidden="true" />
                      Revisions
                    </button>
                    {format === "markdown" && (
                      <Link
                        role="menuitem"
                        to={`/pages/${id}/markdown`}
                        onClick={() => setMenuOpen(false)}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                      >
                        <FileCode2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Open in Markdown editor
                      </Link>
                    )}
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

      {isTrashed && (
        <TrashedBanner
          noun="page"
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

      {format === "markdown" && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/50 dark:text-amber-200">
          <span className="flex-1">This page is Markdown.</span>
          <Button variant="secondary" size="sm" onClick={convertToBlocks}>
            Convert to blocks
          </Button>
          <Link to={`/pages/${id}/markdown`}>
            <Button variant="ghost" size="sm">
              Open in Markdown editor
            </Button>
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Canvas */}
        <div className="wv-scroll min-w-0 overflow-y-auto rounded-xl bg-zinc-100 p-4 dark:bg-zinc-950/60 lg:max-h-[calc(100vh-9rem)]">
          <CanvasSheet width={preview === "mobile" ? MOBILE_WIDTH : null} style={canvasVars}>
            {builder.blocks.length === 0 ? (
              emptyCanvas
            ) : (
              <div className="p-1">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                  <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                    {builder.blocks.map((block, index) => (
                      <div key={block.id}>
                        {index === 0 ? <AddBlockGap onClick={() => setPickerAt(0)} /> : null}
                        <BlockFrame
                          block={block}
                          index={index}
                          count={builder.blocks.length}
                          selected={builder.selectedId === block.id}
                          postId={isCreate ? undefined : id}
                          onSelect={() => builder.select(block.id)}
                          onMove={(delta) => builder.moveBy(block.id, delta)}
                          onEdit={() => {
                            builder.select(block.id);
                            setRail("block");
                          }}
                          onDuplicate={() => builder.duplicate(block.id)}
                          onRemove={() => builder.remove(block.id)}
                          onReplace={(next) => builder.replaceBlock(block.id, next)}
                        />
                        {index < builder.blocks.length - 1 && <AddBlockGap onClick={() => setPickerAt(index + 1)} />}
                      </div>
                    ))}
                  </SortableContext>
                </DndContext>
                <AddBlockGap always onClick={() => setPickerAt(builder.blocks.length)} />
              </div>
            )}
          </CanvasSheet>
        </div>

        {/* Right rail */}
        <aside className="space-y-4">
          <Tabs
            value={rail}
            onChange={setRail}
            tabs={[
              { label: "Page", value: "page" },
              { label: "Block", value: "block" },
            ]}
          />
          {rail === "page" ? pageTab : blockTab}
        </aside>
      </div>

      <AddBlockPicker
        open={pickerAt !== null}
        onClose={() => setPickerAt(null)}
        postId={isCreate ? undefined : id}
        onInsert={(block) => {
          builder.insertAt(pickerAt ?? builder.blocks.length, block);
          setRail("block");
        }}
      />

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
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setTitle(rev.title);
                  setMetaDirty(true);
                  try {
                    const parsed = JSON.parse(rev.content) as BlocksDoc;
                    if (Array.isArray(parsed?.blocks)) {
                      builder.replaceAll(parsed.blocks as BuilderBlock[]);
                      toast.push("info", "Revision loaded — click Save to persist.");
                      return;
                    }
                    throw new Error("not blocks");
                  } catch {
                    toast.error("That revision is not a blocks document; open it in the Markdown editor.");
                  }
                }}
              >
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
