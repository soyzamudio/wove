import { useState } from "react";
import { ChevronDown, ChevronRight, Image as ImageIcon, RotateCcw, Trash2, X } from "lucide-react";
import type { ImageRef, Media, Post } from "@wove/sdk";
import { relativeTime } from "../lib/time";
import { SEO_DESCRIPTION_MAX, SEO_TITLE_MAX, counter, seoPreview } from "../lib/seo";
import { MediaPicker } from "./MediaPicker";
import { Button, Card, Input, Label, Textarea, cx } from "./ui";

/** Media library item → the `ImageRef` blocks/SEO consume, carrying srcset variants. */
export function mediaToImageRef(item: Media): ImageRef {
  return {
    url: item.url,
    alt: item.alt ?? "",
    mediaId: item.id,
    width: item.width ?? undefined,
    height: item.height ?? undefined,
    variants: item.variants?.length ? item.variants : undefined,
  };
}

export interface SeoState {
  title: string;
  description: string;
  ogImage: ImageRef | null;
  noindex: boolean;
}

export const EMPTY_SEO: SeoState = { title: "", description: "", ogImage: null, noindex: false };

export function seoFromPost(post: Post): SeoState {
  return {
    title: post.seo?.title ?? "",
    description: post.seo?.description ?? "",
    ogImage: post.seo?.ogImage ?? null,
    noindex: post.seo?.noindex ?? false,
  };
}

/** Shape `post.create` / `post.update` expect (empty strings become nulls). */
export function seoToInput(seo: SeoState) {
  return {
    title: seo.title.trim() || null,
    description: seo.description.trim() || null,
    ogImage: seo.ogImage,
    noindex: seo.noindex,
  };
}

// ---------------------------------------------------------------------------
// Image field
// ---------------------------------------------------------------------------

export function ImageRefField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: ImageRef | null;
  onChange: (next: ImageRef | null) => void;
  hint?: string;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div>
      <Label>{label}</Label>
      {value ? (
        <div className="flex items-start gap-2.5">
          <img
            src={value.url}
            alt={value.alt || ""}
            className="h-16 w-16 shrink-0 rounded-lg border border-zinc-200 object-cover dark:border-zinc-800"
          />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="truncate text-xs text-zinc-500 dark:text-zinc-400" title={value.url}>
              {value.url.split("/").pop()}
            </div>
            <div className="flex gap-1.5">
              <Button type="button" variant="secondary" size="sm" onClick={() => setPickerOpen(true)}>
                Replace
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
                <X className="h-3 w-3" aria-hidden="true" />
                Remove
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-300 px-3 py-4 text-sm text-zinc-500 transition-colors hover:border-blue-500 hover:text-blue-700 dark:border-zinc-700 dark:text-zinc-400 dark:hover:text-blue-400"
        >
          <ImageIcon className="h-4 w-4" aria-hidden="true" />
          Choose image
        </button>
      )}
      {hint && <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">{hint}</p>}

      <MediaPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={(item) => onChange(mediaToImageRef(item))} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// SEO section
// ---------------------------------------------------------------------------

function CharCount({ value, max }: { value: string; max: number }) {
  const c = counter(value, max);
  return (
    <span className={cx("text-[11px] tabular-nums", c.over ? "text-red-600 dark:text-red-400" : "text-zinc-400")}>
      {c.length}/{max}
    </span>
  );
}

export function SeoSection({
  seo,
  onChange,
  postTitle,
  slug,
  excerpt,
  siteUrl,
}: {
  seo: SeoState;
  onChange: (next: SeoState) => void;
  postTitle: string;
  slug: string;
  excerpt?: string;
  siteUrl?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const preview = seoPreview({
    siteUrl,
    slug,
    postTitle,
    seoTitle: seo.title,
    description: seo.description,
    excerpt,
  });
  const set = (patch: Partial<SeoState>) => onChange({ ...seo, ...patch });

  return (
    <Card className={open ? "space-y-3" : "py-2.5"}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 text-left text-base font-semibold tracking-tight"
      >
        {open ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
        SEO
        {!open && seo.noindex && <span className="ml-auto text-[11px] font-normal text-amber-600 dark:text-amber-400">noindex</span>}
      </button>

      {open && (
        <>
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="seo-title">SEO title</Label>
              <CharCount value={seo.title} max={SEO_TITLE_MAX} />
            </div>
            <Input
              id="seo-title"
              value={seo.title}
              placeholder={postTitle || "Same as the title"}
              onChange={(e) => set({ title: e.target.value })}
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="seo-description">Meta description</Label>
              <CharCount value={seo.description} max={SEO_DESCRIPTION_MAX} />
            </div>
            <Textarea
              id="seo-description"
              rows={3}
              value={seo.description}
              placeholder="A one-sentence summary for search results…"
              onChange={(e) => set({ description: e.target.value })}
            />
          </div>

          <ImageRefField
            label="OG image"
            value={seo.ogImage}
            onChange={(ogImage) => set({ ogImage })}
            hint="Defaults to the featured image."
          />

          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={seo.noindex}
              onChange={(e) => set({ noindex: e.target.checked })}
              className="h-3.5 w-3.5 rounded border-zinc-300 text-blue-600 focus:ring-blue-600 dark:border-zinc-700"
            />
            Hide from search engines
          </label>

          <div>
            <Label>Search preview</Label>
            <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="truncate text-xs text-zinc-600 dark:text-zinc-400">{preview.url}</div>
              <div className="mt-0.5 truncate text-[15px] leading-snug text-[#1a0dab] dark:text-[#8ab4f8]">
                {preview.title}
              </div>
              <div className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                {preview.description}
              </div>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Banners
// ---------------------------------------------------------------------------

export function RecoveryBanner({
  savedAt,
  onRestore,
  onDiscard,
}: {
  savedAt: string;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-sm text-blue-800 dark:border-blue-900/70 dark:bg-blue-950/50 dark:text-blue-200">
      <RotateCcw className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">You have unsaved changes from {relativeTime(savedAt)}.</span>
      <Button variant="secondary" size="sm" onClick={onRestore}>
        Restore
      </Button>
      <Button variant="ghost" size="sm" onClick={onDiscard}>
        Discard
      </Button>
    </div>
  );
}

export function TrashedBanner({
  noun,
  onRestore,
  onDeleteForever,
  busy,
}: {
  noun: string;
  onRestore: () => void;
  onDeleteForever: () => void;
  busy?: boolean;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/50 dark:text-amber-200">
      <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">This {noun} is in the trash. It is hidden from your site.</span>
      <Button variant="secondary" size="sm" disabled={busy} onClick={onRestore}>
        Restore
      </Button>
      <Button variant="danger" size="sm" disabled={busy} onClick={onDeleteForever}>
        Delete permanently
      </Button>
    </div>
  );
}
