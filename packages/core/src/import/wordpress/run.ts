/**
 * WordPress import job runner.
 *
 * Every write goes through the same tool *handlers* the REST/MCP surface uses, so plugin
 * hooks (`post.beforeSave`, `post.afterSave`, `post.publish`, `media.afterUpload`) fire
 * exactly as they would for a hand-made post.
 *
 * AUDIT: an import writes exactly ONE audit row — the `import.wordpress` call itself,
 * written by `dispatch`. The hundreds of individual post/media writes it performs are
 * deliberately not audited one by one: the job report (`import.status`) is the record of
 * what happened, and N audit rows per import would drown the log.
 */
import { sql } from "drizzle-orm";
import type { BlocksDoc, ImageRef, ImportJob, ImportOptions, Media, MenuItem, Post } from "@wove/sdk";
import { posts } from "../../db/schema";
import { newId, nowIso, slugify } from "../../ids";
import { maxUploadBytes, storeMedia } from "../../tools/media";
import { menuSet, readMenu } from "../../tools/menus";
import { postCreate, postUpdate } from "../../tools/content";
import type { Ctx } from "../../tools/registry";
import { upsertTerm } from "../../tools/shared";
import { emptyJob, saveJob } from "../jobs";
import { htmlToMarkdown, rewriteUrls, type UrlMap } from "./html-to-markdown";
import { parseWxr, type WxrDoc, type WxrItem } from "./parse";

/** WordPress post status → ours. `skip` means the item is not content we import. */
const STATUS_MAP: Record<string, Post["status"] | "skip"> = {
  publish: "published",
  future: "scheduled",
  draft: "draft",
  pending: "draft",
  "auto-draft": "draft",
  private: "draft",
  trash: "trashed",
  inherit: "skip",
};

/** Attachment types we are willing to pull into the library. */
const ALLOWED_MEDIA = [/^image\//, /^video\//, /^audio\//, /^application\/pdf$/, /^application\/zip$/];

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
  avif: "image/avif", svg: "image/svg+xml", bmp: "image/bmp", ico: "image/x-icon",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", m4a: "audio/mp4",
  pdf: "application/pdf", zip: "application/zip",
};

const DOWNLOAD_TIMEOUT_MS = 30_000;
const DOWNLOAD_CONCURRENCY = 3;
const MAX_WARNINGS = 300;
const PERSIST_EVERY = 10;

function filenameFromUrl(url: string): string {
  try {
    const p = new URL(url).pathname;
    return decodeURIComponent(p.split("/").filter(Boolean).pop() ?? "file");
  } catch {
    return url.split("/").pop() ?? "file";
  }
}

function mimeFor(url: string, headerValue: string | null): string {
  const fromHeader = headerValue?.split(";")[0]?.trim().toLowerCase();
  if (fromHeader && fromHeader !== "application/octet-stream" && fromHeader !== "binary/octet-stream") return fromHeader;
  const ext = filenameFromUrl(url).split(".").pop()?.toLowerCase() ?? "";
  return EXT_MIME[ext] ?? "application/octet-stream";
}

const imageRefOf = (m: Media, alt: string): ImageRef => ({
  url: m.url,
  alt: m.alt ?? alt,
  mediaId: m.id,
  ...(m.width ? { width: m.width } : {}),
  ...(m.height ? { height: m.height } : {}),
  ...(m.variants?.length ? { variants: m.variants } : {}),
});

/** SEO fields, Yoast first then Rank Math. */
function seoFrom(meta: Record<string, string>) {
  const title = meta._yoast_wpseo_title || meta.rank_math_title || null;
  const description = meta._yoast_wpseo_metadesc || meta.rank_math_description || null;
  const noindex =
    meta["_yoast_wpseo_meta-robots-noindex"] === "1" || /noindex/i.test(meta.rank_math_robots ?? "");
  if (!title && !description && !noindex) return undefined;
  return { title, description, noindex };
}

/** Desired slug for a WXR item, before core de-dupes it. */
function desiredSlug(item: WxrItem): string {
  const name = item.postName ? decodeURIComponent(item.postName) : "";
  return slugify(name || item.title || `wp-${item.postId ?? newId(6)}`);
}

/** Site-relative path a WordPress permalink should become. */
function pathOfLink(link: string | null): string | null {
  if (!link) return null;
  try {
    const p = new URL(link).pathname.replace(/\/$/, "");
    return p || "/";
  } catch {
    return null;
  }
}

async function withConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      await fn(items[i]!);
    }
  });
  await Promise.all(workers);
}

export interface RunResult {
  job: ImportJob;
}

class JobState {
  constructor(public job: ImportJob) {}
  #since = 0;

  warn(item: string | null, message: string): void {
    if (this.job.warnings.length >= MAX_WARNINGS) return;
    if (this.job.warnings.some((w) => w.item === item && w.message === message)) return;
    this.job.warnings.push({ item, message });
  }
  phase(name: string): void {
    this.job.phase = name;
    saveJob(this.job);
  }
  tick(n = 1): void {
    this.job.progress.done += n;
    this.#since += n;
    if (this.#since >= PERSIST_EVERY) {
      this.#since = 0;
      saveJob(this.job);
    }
  }
}

/**
 * Run an import to completion. `startImport` calls this in the background; tests call it
 * directly.
 */
export async function runImport(ctx: Ctx, xml: string, options: ImportOptions, job: ImportJob): Promise<ImportJob> {
  const s = new JobState(job);
  const write = !options.dryRun;
  job.status = "running";

  try {
    // ---------------------------------------------------------------- parsing
    s.phase("parsing");
    const doc: WxrDoc = parseWxr(xml);
    job.source = {
      siteTitle: doc.siteTitle,
      siteUrl: doc.baseSiteUrl ?? doc.siteUrl,
      items: doc.items.length,
    };

    const attachments = doc.items.filter((i) => i.postType === "attachment" && i.attachmentUrl);
    const navItems = doc.items.filter((i) => i.postType === "nav_menu_item");
    const contentItems = doc.items.filter((i) => i.postType === "post" || i.postType === "page");
    const otherTypes = new Set(
      doc.items
        .filter((i) => !["attachment", "nav_menu_item", "post", "page"].includes(i.postType))
        .map((i) => i.postType),
    );
    for (const t of otherTypes) s.warn(null, `Custom post type "${t}" is not imported`);

    const importableTerms = doc.terms.filter((t) => t.taxonomy === "category" || t.taxonomy === "post_tag");
    job.progress.total = importableTerms.length + attachments.length + contentItems.length + navItems.length;
    saveJob(job);

    // ---------------------------------------------------------------- terms
    s.phase("terms");
    /** `${wpTaxonomy}:${nicename}` and `term:${wpTermId}` → what we stored. */
    const termBySource = new Map<string, { taxonomy: string; name: string; slug: string }>();
    for (const t of importableTerms) {
      try {
        const taxonomy = t.taxonomy === "post_tag" ? "tag" : "category";
        const slug = slugify(t.name);
        if (write) upsertTerm(ctx.db, taxonomy, t.name);
        const ref = { taxonomy, name: t.name, slug };
        termBySource.set(`${t.taxonomy}:${t.slug}`, ref);
        if (t.id) termBySource.set(`term:${t.id}`, ref);
        job.counts.terms++;
      } catch (e) {
        job.counts.failed++;
        s.warn(t.name, `Term failed: ${(e as Error).message}`);
      }
      s.tick();
    }

    // ---------------------------------------------------------------- media
    s.phase("media");
    const mediaByWpId = new Map<string, Media>();
    /** Old absolute URL → new URL, for content rewriting. */
    const mediaUrls = new Map<string, string>();

    if (options.downloadMedia && write) {
      const cap = maxUploadBytes();
      await withConcurrency(attachments, DOWNLOAD_CONCURRENCY, async (item) => {
        const url = item.attachmentUrl!;
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const mime = mimeFor(url, res.headers.get("content-type"));
          if (!ALLOWED_MEDIA.some((re) => re.test(mime))) {
            throw new Error(`unsupported type ${mime}`);
          }
          const bytes = new Uint8Array(await res.arrayBuffer());
          if (bytes.byteLength > cap) throw new Error(`exceeds the ${Math.round(cap / 1024 / 1024)} MB upload limit`);
          const stored = await storeMedia(ctx, {
            bytes,
            filename: filenameFromUrl(url),
            mime,
            alt: item.title || null,
          });
          if (item.postId) mediaByWpId.set(item.postId, stored);
          mediaUrls.set(url, stored.url);
          mediaUrls.set(url.split(/[?#]/)[0]!, stored.url);
          job.counts.media++;
        } catch (e) {
          job.counts.failed++;
          s.warn(item.title || url, `Media download failed (${(e as Error).message}); the old URL was kept`);
        }
        s.tick();
      });
    } else {
      // dryRun still reports what a real run would fetch.
      if (options.downloadMedia) job.counts.media += attachments.length;
      s.tick(attachments.length);
    }

    // ---------------------------------------------------------------- posts
    s.phase("posts");
    const slugByWpId = new Map<string, string>();
    const links = new Map<string, string>();
    for (const item of contentItems) {
      const slug = desiredSlug(item);
      if (item.postId) slugByWpId.set(item.postId, slug);
      const path = pathOfLink(item.link);
      if (path) links.set(path, `/${slug}`);
      links.set(`/${slug}`, `/${slug}`);
    }
    const siteUrls = [doc.baseSiteUrl, doc.baseBlogUrl, doc.siteUrl]
      .filter((u): u is string => !!u)
      .map((u) => u.replace(/\/$/, ""));
    const urlMap: UrlMap = { media: mediaUrls, siteUrls, links };

    const attachmentRefs = new Map<string, { url: string; alt?: string }>();
    for (const a of attachments) {
      if (!a.postId) continue;
      const stored = mediaByWpId.get(a.postId);
      attachmentRefs.set(a.postId, { url: stored?.url ?? a.attachmentUrl!, alt: a.title });
    }

    const toMarkdown = (html: string, title: string) => {
      const { markdown, warnings } = htmlToMarkdown(html, { attachments: attachmentRefs });
      for (const w of warnings) s.warn(title, w);
      return rewriteUrls(markdown, urlMap);
    };

    for (const item of contentItems) {
      try {
        const mapped = STATUS_MAP[item.status] ?? "draft";
        if (mapped === "skip") {
          job.counts.skipped++;
          s.tick();
          continue;
        }
        if (item.status === "private") s.warn(item.title, "Private post imported as a draft");

        const existing = item.postId
          ? ctx.db.select().from(posts).where(sql`json_extract(${posts.meta}, '$.wp.id') = ${item.postId}`).get()
          : undefined;
        if (existing && !options.overwrite) {
          job.counts.skipped++;
          s.tick();
          continue;
        }

        const markdown = toMarkdown(item.content, item.title);
        const excerptMd = item.excerpt.trim() ? toMarkdown(item.excerpt, item.title) : "";
        const isPage = item.postType === "page";
        const asBlocks = isPage && options.pagesAsBlocks;

        const blocks: BlocksDoc | undefined = asBlocks
          ? { version: 1, blocks: [{ id: newId(), type: "markdown", props: { markdown, width: "content" } }] }
          : undefined;

        const terms = item.categories
          .filter((c) => c.domain === "category" || c.domain === "post_tag")
          .map((c) => ({
            taxonomy: c.domain === "post_tag" ? "tag" : "category",
            name: c.name || c.nicename,
          }))
          .filter((t) => !!t.name);

        const thumb = item.meta._thumbnail_id;
        const featured = thumb ? mediaByWpId.get(thumb) : undefined;
        if (thumb && !featured && options.downloadMedia && write) {
          s.warn(item.title, `Featured image (attachment ${thumb}) could not be resolved`);
        }

        const author = doc.authors.find((a) => a.login === item.creator);
        const payload = {
          type: isPage ? ("page" as const) : ("post" as const),
          title: item.title || "(untitled)",
          content: asBlocks ? "" : markdown,
          ...(blocks ? { blocks } : { format: "markdown" as const }),
          excerpt: excerptMd || undefined,
          status: mapped,
          publishedAt: item.date ?? undefined,
          featuredImage: featured ? imageRefOf(featured, item.title) : null,
          seo: seoFrom(item.meta),
          terms,
          meta: {
            wp: {
              id: item.postId,
              link: item.link,
              type: item.postType,
              author: author?.displayName ?? item.creator ?? null,
              parent: item.postParent && item.postParent !== "0" ? item.postParent : null,
              menuOrder: item.menuOrder,
              importedAt: nowIso(),
            },
          },
        };

        if (write) {
          if (existing) {
            // Keep our id and slug; everything else comes from the export.
            await postUpdate.handler(ctx, { id: existing.id, ...payload } as never);
          } else {
            await postCreate.handler(ctx, { slug: desiredSlug(item), ...payload } as never);
          }
        }
        if (isPage) job.counts.pages++;
        else job.counts.posts++;
      } catch (e) {
        job.counts.failed++;
        s.warn(item.title || item.postId, `Import failed: ${(e as Error).message}`);
      }
      s.tick();
    }

    // ---------------------------------------------------------------- menus
    s.phase("menus");
    const byMenu = new Map<string, { name: string; items: WxrItem[] }>();
    for (const item of navItems) {
      const ref = item.categories.find((c) => c.domain === "nav_menu");
      const key = ref?.nicename || slugify(ref?.name ?? "menu");
      const group = byMenu.get(key) ?? { name: ref?.name || key, items: [] };
      group.items.push(item);
      byMenu.set(key, group);
    }

    let headerTaken = false;
    for (const [key, group] of byMenu) {
      const isFooter = /footer/i.test(`${key} ${group.name}`);
      let location: string;
      if (isFooter) location = "footer";
      else if (!headerTaken) {
        location = "header";
        headerTaken = true;
      } else location = slugify(group.name || key);

      if (!options.overwrite && readMenu(ctx.db, location)) {
        job.counts.skipped++;
        s.tick(group.items.length);
        continue;
      }

      const resolved = new Map<string, MenuItem & { parent: string | null; order: number }>();
      for (const item of [...group.items].sort((a, b) => a.menuOrder - b.menuOrder)) {
        try {
          const type = item.meta._menu_item_type ?? "custom";
          const objectId = item.meta._menu_item_object_id ?? "";
          let href: string | null = null;
          if (type === "post_type") {
            const slug = slugByWpId.get(objectId);
            href = slug ? `/${slug}` : null;
            if (!href) s.warn(item.title, `Menu item points at post ${objectId}, which is not in the export`);
          } else if (type === "taxonomy") {
            const term = termBySource.get(`term:${objectId}`);
            href = term ? `/${term.taxonomy === "tag" ? "tag" : "category"}/${term.slug}` : null;
            if (!href) s.warn(item.title, `Menu item points at term ${objectId}, which is not in the export`);
          } else {
            const raw = item.meta._menu_item_url ?? "";
            href = raw ? rewriteUrls(raw, urlMap) : null;
            if (!href) s.warn(item.title, "Custom menu item has no URL");
          }
          if (!href) {
            s.tick();
            continue;
          }
          const parent = item.meta._menu_item_menu_item_parent;
          resolved.set(item.postId ?? newId(), {
            id: newId(),
            label: item.title || href,
            href,
            parent: parent && parent !== "0" ? parent : null,
            order: item.menuOrder,
          });
        } catch (e) {
          job.counts.failed++;
          s.warn(item.title, `Menu item failed: ${(e as Error).message}`);
        }
        s.tick();
      }

      // Roots first, then children — a parent may appear after its child in menu_order.
      const tree: MenuItem[] = [];
      const roots = new Map<string, MenuItem>();
      for (const [wpId, node] of resolved) {
        if (node.parent && resolved.has(node.parent)) continue;
        const { parent: _p, order: _o, ...menuItem } = node;
        roots.set(wpId, menuItem);
        tree.push(menuItem);
      }
      for (const [, node] of resolved) {
        if (!node.parent || !resolved.has(node.parent)) continue;
        const { parent, order: _o, ...menuItem } = node;
        const target = roots.get(parent!);
        if (!target) {
          s.warn(node.label, "Menu nesting deeper than one level was flattened");
          tree.push(menuItem);
          continue;
        }
        (target.children ??= []).push(menuItem);
      }

      if (tree.length === 0) continue;
      if (write) await menuSet.handler(ctx, { location, name: group.name, items: tree } as never);
      job.counts.menus++;
    }

    // ---------------------------------------------------------------- done
    job.status = "done";
    job.phase = "done";
    job.progress.done = job.progress.total;
    job.finishedAt = nowIso();
  } catch (e) {
    job.status = "failed";
    job.phase = "failed";
    job.error = (e as Error)?.message ?? "Import failed";
    job.finishedAt = nowIso();
  }
  return saveJob(job);
}

/**
 * Create a job, kick the work off in the background and return the snapshot immediately —
 * the tool call must not block on a multi-minute import.
 */
export function startImport(ctx: Ctx, xml: string, options: ImportOptions): ImportJob {
  const job = saveJob(emptyJob(newId()));
  const snapshot = { ...job, counts: { ...job.counts }, progress: { ...job.progress } };
  void runImport(ctx, xml, options, job).catch((e) => {
    job.status = "failed";
    job.error = (e as Error)?.message ?? "Import failed";
    job.finishedAt = nowIso();
    saveJob(job);
  });
  return snapshot;
}
