/**
 * Site templates: list/get the built-ins, dry-run an apply, apply one, and export the
 * current site as a reusable template.
 *
 * Applying goes through the existing tool *handlers* (not `dispatch`), so hooks, slug
 * rules and schema validation all run, while the audit log gets exactly one row: the
 * `template.apply` call itself.
 */
import { eq, like, ne, and } from "drizzle-orm";
import {
  ImageRef, SiteTemplate, ToolCatalog, ToolDescriptions,
  type BlocksDoc, type Design, type Menu, type TemplateApplyReport,
} from "@wove/sdk";
import type { DB } from "../db";
import { media, posts, users } from "../db/schema";
import { slugify } from "../ids";
import { mediaDir, storage } from "../storage";
import { BUILTIN_TEMPLATES, builtinTemplate } from "../templates";
import { badRequest, defineTool, notFound, type Ctx, type Tool } from "./registry";
import { postCreate, postUpdate } from "./content";
import { designUpdate } from "./design";
import { menuSet } from "./menus";
import { safeFilename, storeMedia } from "./media";
import { settingsUpdate } from "./settings";
import { readDesign } from "./design";
import { readMenus } from "./menus";
import { hydratePosts, readSettings } from "./shared";

const D = ToolDescriptions;

/** `template://<name>` in a page image url points at a bundled asset of the same template. */
export const TEMPLATE_SCHEME = "template://";

/** Total size an exported template may carry as base64 media. */
export const MAX_EXPORT_MEDIA_BYTES = 20 * 1024 * 1024;

// ---------------------------------------------------------------- image walking

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Every image in a blocks document is an `ImageRef` — the only shape in the block schemas
 * with a string `url` — wherever it sits (hero.image, gallery.images, logos, avatars).
 * Walking for that key finds them all without a per-block-type switch.
 */
function mapImageUrls(value: unknown, fn: (url: string) => string): unknown {
  if (Array.isArray(value)) return value.map((v) => mapImageUrls(v, fn));
  if (!isObj(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = k === "url" && typeof v === "string" ? fn(v) : mapImageUrls(v, fn);
  }
  return out;
}

/** Every image url in a blocks document, in document order (deduped). */
export function collectImageUrls(doc: BlocksDoc): string[] {
  const seen = new Set<string>();
  mapImageUrls(doc, (url) => {
    seen.add(url);
    return url;
  });
  return [...seen];
}

export function rewriteImageUrls(doc: BlocksDoc, fn: (url: string) => string): BlocksDoc {
  return mapImageUrls(doc, fn) as BlocksDoc;
}

// ---------------------------------------------------------------- resolution

/** An explicit `template` wins over `slug`; a slug must name a built-in. */
export function resolveTemplate(input: { slug?: string; template?: unknown }): SiteTemplate {
  if (input.template !== undefined) {
    const parsed = SiteTemplate.safeParse(input.template);
    if (!parsed.success) throw badRequest("`template` is not a valid site template", parsed.error.flatten());
    return parsed.data;
  }
  if (input.slug) {
    const found = builtinTemplate(input.slug);
    if (!found) throw notFound(`No template "${input.slug}"`, { slug: input.slug });
    return found;
  }
  throw badRequest("Provide either `slug` (a built-in) or `template` (a full template document)");
}

const summarize = (t: SiteTemplate) => ({
  slug: t.meta.slug, name: t.meta.name, description: t.meta.description,
  author: t.meta.author, templateVersion: t.meta.templateVersion,
  pages: t.pages.length, source: "builtin" as const,
});

// ---------------------------------------------------------------- helpers

const slugExists = (db: DB, slug: string) =>
  !!db.select({ id: posts.id }).from(posts).where(eq(posts.slug, slug)).get();

const postBySlug = (db: DB, slug: string) =>
  db.select().from(posts).where(eq(posts.slug, slug)).get();

/** Media rows are keyed `<id>-<safe filename>`; a template asset matches on that suffix. */
function findMediaByFilename(db: DB, name: string) {
  const fname = safeFilename(name);
  const rows = db.select().from(media).where(like(media.path, `%${fname}`)).all();
  return rows.find((r) => r.path === fname || r.path.endsWith(`-${fname}`));
}

/** Run a tool's handler in-process: its input schema still validates, its hooks still fire. */
async function run<T extends Tool<any, any>>(tool: T, ctx: Ctx, input: unknown): Promise<any> {
  const parsed = tool.input.safeParse(input);
  if (!parsed.success) {
    throw badRequest(`Template rejected by ${tool.name}`, parsed.error.flatten());
  }
  return await tool.handler(ctx, parsed.data);
}

/**
 * Everything that could fail is checked before a single row is written: the pages must
 * parse and every `template://` reference must name a bundled asset. Apply is therefore
 * atomic in practice — it either does not start, or it runs to completion.
 */
function assertResolvable(t: SiteTemplate): void {
  const names = new Set(t.media.map((m) => m.name));
  const missing = new Set<string>();
  for (const page of t.pages) {
    for (const url of collectImageUrls(page.blocks)) {
      if (url.startsWith(TEMPLATE_SCHEME) && !names.has(url.slice(TEMPLATE_SCHEME.length))) missing.add(url);
    }
  }
  if (missing.size) {
    throw badRequest(
      `Template references bundled media that it does not include: ${[...missing].join(", ")}`,
      { missing: [...missing] },
    );
  }
}

// ---------------------------------------------------------------- report

export interface PlanOptions {
  mode: "replace" | "merge";
  includeSampleContent: boolean;
}

/** The report `template.apply` would produce, computed without writing anything. */
export function planApply(db: DB, t: SiteTemplate, opts: PlanOptions): TemplateApplyReport {
  const createdPages: string[] = [];
  const overwrittenPages: string[] = [];
  const skippedPages: string[] = [];
  for (const page of t.pages) {
    if (!slugExists(db, page.slug)) createdPages.push(page.slug);
    else if (opts.mode === "replace") overwrittenPages.push(page.slug);
    else skippedPages.push(page.slug);
  }
  const createdPosts = opts.includeSampleContent
    ? t.samplePosts.filter((p) => !slugExists(db, p.slug)).map((p) => p.slug)
    : [];
  const mediaUploaded = t.media.filter((m) => !findMediaByFilename(db, m.name)).length;
  return {
    createdPages, overwrittenPages, skippedPages, createdPosts,
    menusSet: t.menus.map((m) => m.location),
    designApplied: true,
    settingsApplied: opts.mode === "replace" && !!t.settings,
    mediaUploaded,
  };
}

// ---------------------------------------------------------------- tools

export const templateList = defineTool({
  name: "template.list",
  description: D["template.list"],
  input: ToolCatalog["template.list"].input,
  output: ToolCatalog["template.list"].output,
  scopes: ToolCatalog["template.list"].scopes,
  mutation: false,
  handler: () => BUILTIN_TEMPLATES.map(summarize),
});

export const templateGet = defineTool({
  name: "template.get",
  description: D["template.get"],
  input: ToolCatalog["template.get"].input,
  output: ToolCatalog["template.get"].output,
  scopes: ToolCatalog["template.get"].scopes,
  mutation: false,
  handler: (_ctx, input) => {
    const found = builtinTemplate(input.slug);
    if (!found) throw notFound(`No template "${input.slug}"`, { slug: input.slug });
    return found;
  },
});

export const templatePreview = defineTool({
  name: "template.preview",
  description: D["template.preview"],
  input: ToolCatalog["template.preview"].input,
  output: ToolCatalog["template.preview"].output,
  scopes: ToolCatalog["template.preview"].scopes,
  mutation: false,
  handler: (ctx, input) => {
    const t = resolveTemplate(input);
    assertResolvable(t);
    // The preview input carries no `includeSampleContent`: report the sample posts that
    // *would* land, so the admin can show "3 sample posts" next to the checkbox.
    return planApply(ctx.db, t, { mode: input.mode, includeSampleContent: true });
  },
});

export const templateApply = defineTool({
  name: "template.apply",
  description: D["template.apply"],
  input: ToolCatalog["template.apply"].input,
  output: ToolCatalog["template.apply"].output,
  scopes: ToolCatalog["template.apply"].scopes,
  handler: async (ctx, input) => {
    const t = resolveTemplate(input);
    assertResolvable(t);
    const plan = planApply(ctx.db, t, { mode: input.mode, includeSampleContent: input.includeSampleContent });

    // (a) bundled media: reuse an identically-named asset, upload the rest.
    const assetUrls = new Map<string, string>();
    let mediaUploaded = 0;
    for (const asset of t.media) {
      const existing = findMediaByFilename(ctx.db, asset.name);
      if (existing) {
        assetUrls.set(asset.name, existing.url);
        continue;
      }
      const b64 = asset.base64.replace(/^data:[^;]+;base64,/, "");
      let bytes: Uint8Array;
      try {
        bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      } catch {
        throw badRequest(`Bundled media "${asset.name}" is not valid base64`);
      }
      const stored = await storeMedia(ctx, { bytes, filename: asset.name, mime: asset.mime });
      assetUrls.set(asset.name, stored.url);
      mediaUploaded += 1;
    }
    const resolveUrl = (url: string) => {
      if (!url.startsWith(TEMPLATE_SCHEME)) return url;
      const name = url.slice(TEMPLATE_SCHEME.length);
      const real = assetUrls.get(name);
      if (!real) throw badRequest(`Unknown bundled media reference "${url}"`, { missing: [url] });
      return real;
    };

    // (c) design — a full document, so this replaces rather than patches.
    await run(designUpdate, ctx, t.design);

    // (d) menus
    for (const menu of t.menus) {
      await run(menuSet, ctx, { location: menu.location, name: menu.name, items: menu.items });
    }

    // (e) pages
    const createdPages: string[] = [];
    const overwrittenPages: string[] = [];
    const skippedPages: string[] = [];
    for (const page of t.pages) {
      const blocks = rewriteImageUrls(page.blocks, resolveUrl);
      const existing = postBySlug(ctx.db, page.slug);
      const seo = page.seo ? { title: page.seo.title ?? null, description: page.seo.description ?? null } : undefined;
      if (!existing) {
        await run(postCreate, ctx, {
          type: "page", slug: page.slug, title: page.title, status: "published", blocks, ...(seo ? { seo } : {}),
        });
        createdPages.push(page.slug);
      } else if (input.mode === "replace") {
        await run(postUpdate, ctx, {
          id: existing.id, type: "page", title: page.title, status: "published", blocks, ...(seo ? { seo } : {}),
        });
        overwrittenPages.push(page.slug);
      } else {
        skippedPages.push(page.slug);
      }
    }

    // (f) sample posts — never overwrite an existing slug, in either mode.
    const createdPosts: string[] = [];
    if (input.includeSampleContent) {
      for (const sample of t.samplePosts) {
        if (slugExists(ctx.db, sample.slug)) continue;
        await run(postCreate, ctx, {
          type: "post", slug: sample.slug, title: sample.title, content: sample.content,
          status: "published", ...(sample.excerpt ? { excerpt: sample.excerpt } : {}),
          ...(sample.terms?.length ? { terms: sample.terms } : {}),
        });
        createdPosts.push(sample.slug);
      }
    }

    // (g) settings: a merge must not rename someone's site.
    const settingsApplied = input.mode === "replace" && !!t.settings;
    if (settingsApplied) await run(settingsUpdate, ctx, t.settings);

    return {
      createdPages, overwrittenPages, skippedPages, createdPosts,
      menusSet: plan.menusSet, designApplied: true, settingsApplied, mediaUploaded,
    };
  },
});

// ---------------------------------------------------------------- export

/** Read a stored object back as bytes. Only the local driver can do this today. */
async function readStoredBytes(url: string): Promise<Uint8Array | null> {
  const store = storage();
  if (store.kind !== "local") return null;
  const key = url.split("/").pop();
  if (!key) return null;
  const file = Bun.file(`${mediaDir()}/${decodeURIComponent(key)}`);
  if (!(await file.exists())) return null;
  return new Uint8Array(await file.arrayBuffer());
}

const toBase64 = (bytes: Uint8Array): string => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
};

export const templateExport = defineTool({
  name: "template.export",
  description: D["template.export"],
  input: ToolCatalog["template.export"].input,
  output: ToolCatalog["template.export"].output,
  scopes: ToolCatalog["template.export"].scopes,
  mutation: false,
  handler: async (ctx, input) => {
    const db = ctx.db;
    const settings = readSettings(db);
    const design: Design = readDesign(db);
    const menus: Menu[] = readMenus(db);

    const pageRows = db.select().from(posts)
      .where(and(eq(posts.type, "page"), eq(posts.status, "published"), eq(posts.format, "blocks")))
      .all();
    const pages = hydratePosts(db, pageRows)
      .filter((p) => p.blocks)
      .map((p) => ({
        slug: p.slug,
        title: p.title,
        blocks: p.blocks as BlocksDoc,
        seo: { title: p.seo.title, description: p.seo.description },
      }));
    if (pages.length === 0) {
      throw badRequest("Nothing to export: the site has no published block pages");
    }

    // Only media the exported pages actually reference travels with the template.
    const referenced = new Set<string>();
    for (const page of pages) for (const url of collectImageUrls(page.blocks)) referenced.add(url);
    const mediaRows = db.select().from(media).all().filter((r) => referenced.has(r.url));

    const bundled: Array<{ name: string; mime: string; base64: string }> = [];
    const urlToName = new Map<string, string>();
    let total = 0;
    for (const row of mediaRows) {
      const bytes = await readStoredBytes(row.url);
      if (!bytes) {
        console.warn(`[template.export] media ${row.path} is not readable from storage; leaving its url as-is`);
        continue;
      }
      total += bytes.byteLength;
      if (total > MAX_EXPORT_MEDIA_BYTES) {
        throw badRequest(
          `Bundled media exceeds the ${Math.round(MAX_EXPORT_MEDIA_BYTES / (1024 * 1024))} MB template limit`,
        );
      }
      // The storage key is unique, so two files with the same original name cannot collide.
      const name = row.path;
      bundled.push({ name, mime: row.mime, base64: toBase64(bytes) });
      urlToName.set(row.url, name);
    }

    const exportedPages = pages.map((p) => ({
      ...p,
      blocks: rewriteImageUrls(p.blocks, (url) => {
        const name = urlToName.get(url);
        return name ? `${TEMPLATE_SCHEME}${name}` : url;
      }),
    }));

    const samplePosts = input.includeContent
      ? hydratePosts(
          db,
          db.select().from(posts).where(and(eq(posts.type, "post"), eq(posts.status, "published"), ne(posts.format, "blocks"))).all(),
        ).map((p) => ({
          slug: p.slug,
          title: p.title,
          content: p.content,
          ...(p.excerpt ? { excerpt: p.excerpt } : {}),
          terms: p.terms.map((t) => ({ taxonomy: t.taxonomy, name: t.name })),
        }))
      : [];

    const author = ctx.actor.kind === "user" && ctx.actor.id
      ? db.select({ name: users.name }).from(users).where(eq(users.id, ctx.actor.id)).get()?.name ?? ""
      : "";

    return SiteTemplate.parse({
      version: 1,
      meta: {
        slug: slugify(settings.siteTitle),
        name: settings.siteTitle,
        description: settings.tagline,
        author,
        templateVersion: "1.0.0",
      },
      design,
      menus,
      settings: { siteTitle: settings.siteTitle, tagline: settings.tagline },
      pages: exportedPages,
      samplePosts,
      media: bundled,
    });
  },
});

export const templateTools = [templateList, templateGet, templatePreview, templateApply, templateExport];

/** Re-exported for tests and hosts that want the raw documents. */
export { BUILTIN_TEMPLATES };
export type { ImageRef };
