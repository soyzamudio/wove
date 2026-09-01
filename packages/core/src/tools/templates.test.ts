import { describe, expect, test } from "bun:test";
import { SiteTemplate, type BlocksDoc, type SiteTemplate as SiteTemplateT } from "@wove/sdk";
import { auditLog } from "../db/schema";
import { BUILTIN_TEMPLATES } from "../templates";
import { ADMIN, makeHarness, unwrap } from "../test-helpers";
import { collectImageUrls } from "./templates";

/** 1×1 transparent PNG. */
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function buttonHrefs(doc: BlocksDoc): string[] {
  const out: string[] = [];
  for (const b of doc.blocks) {
    const props = b.props as { buttons?: Array<{ href: string }> };
    for (const btn of props.buttons ?? []) out.push(btn.href);
  }
  return out;
}

const mediaTemplate = (opts: { withAsset: boolean }): unknown => ({
  version: 1,
  meta: { slug: "with-media", name: "With media", description: "", author: "", templateVersion: "1.0.0" },
  design: {},
  menus: [],
  pages: [
    {
      slug: "gallery-page",
      title: "Gallery page",
      blocks: {
        version: 1,
        blocks: [
          { id: "img-1", type: "image", props: { image: { url: "template://dot.png", alt: "A dot" }, width: "wide" } },
        ],
      },
    },
  ],
  samplePosts: [],
  media: opts.withAsset ? [{ name: "dot.png", mime: "image/png", base64: PNG }] : [],
});

describe("built-in templates", () => {
  test("every built-in validates against the SDK contract", () => {
    expect(BUILTIN_TEMPLATES.map((t) => t.meta.slug).sort()).toEqual(["local-business", "magazine", "portfolio", "saas"]);
    for (const t of BUILTIN_TEMPLATES) {
      expect(SiteTemplate.safeParse(t).success).toBe(true);
      expect(t.media).toEqual([]);
      expect(t.settings?.siteTitle).toBeTruthy();
      for (const page of t.pages) {
        expect(page.blocks.blocks.length).toBeGreaterThan(1);
        expect(page.seo?.description).toBeTruthy();
      }
    }
  });

  test("links and menus only point at pages the template creates", () => {
    for (const t of BUILTIN_TEMPLATES) {
      const targets = new Set(["/blog", "/", ...t.pages.map((p) => `/${p.slug}`)]);
      for (const page of t.pages) {
        for (const href of buttonHrefs(page.blocks)) {
          expect({ template: t.meta.slug, page: page.slug, href, ok: targets.has(href) }).toEqual({
            template: t.meta.slug, page: page.slug, href, ok: true,
          });
        }
      }
      for (const menu of t.menus) {
        for (const item of menu.items) {
          expect({ template: t.meta.slug, href: item.href, ok: targets.has(item.href) }).toEqual({
            template: t.meta.slug, href: item.href, ok: true,
          });
        }
      }
      expect(t.menus.map((m) => m.location)).toContain("header");
    }
  });

  test("no page image references a bundled asset (built-ins ship no media)", () => {
    for (const t of BUILTIN_TEMPLATES) {
      for (const page of t.pages) {
        for (const url of collectImageUrls(page.blocks)) expect(url.startsWith("template://")).toBe(false);
      }
    }
  });

  test("the magazine ships three sample posts with real bodies", () => {
    const magazine = BUILTIN_TEMPLATES.find((t) => t.meta.slug === "magazine")!;
    expect(magazine.samplePosts.length).toBe(3);
    for (const p of magazine.samplePosts) {
      expect(p.content.split(/\s+/).length).toBeGreaterThan(150);
      expect(p.terms?.length).toBeGreaterThan(0);
    }
  });
});

describe("template.list / get", () => {
  const h = makeHarness();

  test("lists summaries and fetches one", async () => {
    const list = unwrap(await h.call(ADMIN, "template.list", {}));
    expect(list.length).toBe(4);
    const saas = list.find((t: any) => t.slug === "saas");
    expect(saas).toMatchObject({ name: "Lift", source: "builtin", pages: 4 });

    const full = unwrap(await h.call(ADMIN, "template.get", { slug: "portfolio" }));
    expect(full.meta.name).toBe("Atelier");
    expect(full.pages.map((p: any) => p.slug)).toEqual(["home", "work", "about", "contact"]);
  });

  test("unknown slug 404s", async () => {
    const r = await h.call(ADMIN, "template.get", { slug: "nope" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(404);
  });
});

describe("template.preview", () => {
  test("merge vs replace, and existing slugs", async () => {
    const h = makeHarness();
    const clean = unwrap(await h.call(ADMIN, "template.preview", { slug: "saas", mode: "merge" }));
    expect(clean.createdPages).toEqual(["home", "pricing", "about", "contact"]);
    expect(clean.skippedPages).toEqual([]);
    expect(clean.overwrittenPages).toEqual([]);
    expect(clean.menusSet).toEqual(["header", "footer"]);
    expect(clean.designApplied).toBe(true);
    expect(clean.settingsApplied).toBe(false);
    expect(clean.mediaUploaded).toBe(0);

    unwrap(await h.call(ADMIN, "post.create", { type: "page", slug: "pricing", title: "Old pricing", status: "published" }));

    const merge = unwrap(await h.call(ADMIN, "template.preview", { slug: "saas", mode: "merge" }));
    expect(merge.skippedPages).toEqual(["pricing"]);
    expect(merge.createdPages).toEqual(["home", "about", "contact"]);
    expect(merge.overwrittenPages).toEqual([]);
    expect(merge.settingsApplied).toBe(false);

    const replace = unwrap(await h.call(ADMIN, "template.preview", { slug: "saas", mode: "replace" }));
    expect(replace.overwrittenPages).toEqual(["pricing"]);
    expect(replace.skippedPages).toEqual([]);
    expect(replace.settingsApplied).toBe(true);

    // Sample content: the preview reports what would land if the box is ticked.
    const mag = unwrap(await h.call(ADMIN, "template.preview", { slug: "magazine", mode: "merge" }));
    expect(mag.createdPosts.length).toBe(3);
    h.cleanup();
  });

  test("neither slug nor template is a validation error; both 400s are distinct", async () => {
    const h = makeHarness();
    const none = await h.call(ADMIN, "template.preview", {});
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.status).toBe(400);

    const missing = await h.call(ADMIN, "template.preview", { template: mediaTemplate({ withAsset: false }) });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.message).toContain("template://dot.png");
    h.cleanup();
  });

  test("an explicit template wins over a slug", async () => {
    const h = makeHarness();
    const r = unwrap(await h.call(ADMIN, "template.preview", {
      slug: "saas",
      template: mediaTemplate({ withAsset: true }),
      mode: "merge",
    }));
    expect(r.createdPages).toEqual(["gallery-page"]);
    expect(r.mediaUploaded).toBe(1);
    h.cleanup();
  });
});

describe("template.apply", () => {
  test("creates pages, menus and design, and writes exactly one audit row", async () => {
    const h = makeHarness();
    const before = unwrap(await h.call(ADMIN, "design.get", {}));
    expect(before.fonts.heading).toBe("system");

    h.db.delete(auditLog).run();
    const report = unwrap(await h.call(ADMIN, "template.apply", { slug: "saas", mode: "merge" }));
    expect(report).toMatchObject({
      createdPages: ["home", "pricing", "about", "contact"],
      overwrittenPages: [], skippedPages: [], createdPosts: [],
      menusSet: ["header", "footer"], designApplied: true, settingsApplied: false, mediaUploaded: 0,
    });

    const rows = h.db.select().from(auditLog).all();
    expect(rows.map((r) => r.tool)).toEqual(["template.apply"]);

    const design = unwrap(await h.call(ADMIN, "design.get", {}));
    expect(design.fonts.heading).toBe("inter");
    expect(design.fonts.body).toBe("inter");
    expect(design.colors.accent).toBe("#2563eb");

    const header = unwrap(await h.call(ADMIN, "menu.get", { location: "header" }));
    expect(header.items.map((i: any) => i.label)).toEqual(["Home", "Pricing", "About", "Contact"]);
    for (const i of header.items) expect(i.id).toBeTruthy();

    const pricing = unwrap(await h.call(ADMIN, "post.get", { slug: "pricing" }));
    expect(pricing.type).toBe("page");
    expect(pricing.status).toBe("published");
    expect(pricing.format).toBe("blocks");
    expect(pricing.blocks.blocks.map((b: any) => b.type)).toEqual(["hero", "columns", "faq", "cta"]);
    expect(pricing.seo.description).toContain("Three plans");
    h.cleanup();
  });

  test("merge skips existing slugs, replace overwrites them in place", async () => {
    const h = makeHarness();
    const old = unwrap(await h.call(ADMIN, "post.create", {
      type: "page", slug: "about", title: "Our own about", content: "keep me", status: "published",
    }));

    const merged = unwrap(await h.call(ADMIN, "template.apply", { slug: "portfolio", mode: "merge" }));
    expect(merged.skippedPages).toEqual(["about"]);
    expect(merged.createdPages).toEqual(["home", "work", "contact"]);
    expect(unwrap(await h.call(ADMIN, "post.get", { slug: "about" })).title).toBe("Our own about");

    const replaced = unwrap(await h.call(ADMIN, "template.apply", { slug: "portfolio", mode: "replace" }));
    expect(replaced.overwrittenPages.sort()).toEqual(["about", "contact", "home", "work"]);
    expect(replaced.createdPages).toEqual([]);
    const about = unwrap(await h.call(ADMIN, "post.get", { slug: "about" }));
    expect(about.id).toBe(old.id); // same row, updated in place
    expect(about.title).toBe("About");
    expect(about.format).toBe("blocks");

    const design = unwrap(await h.call(ADMIN, "design.get", {}));
    expect(design.colors.accent).toBe("#18181b");
    expect(design.radius).toBe(4);
    h.cleanup();
  });

  test("sample posts are gated on includeSampleContent and never overwrite a slug", async () => {
    const h = makeHarness();
    const off = unwrap(await h.call(ADMIN, "template.apply", { slug: "magazine", mode: "merge" }));
    expect(off.createdPosts).toEqual([]);
    expect((await h.call(ADMIN, "post.get", { slug: "the-price-rise-you-keep-postponing" })).ok).toBe(false);

    const on = unwrap(await h.call(ADMIN, "template.apply", { slug: "magazine", mode: "merge", includeSampleContent: true }));
    expect(on.createdPosts.length).toBe(3);
    const post = unwrap(await h.call(ADMIN, "post.get", { slug: "the-price-rise-you-keep-postponing" }));
    expect(post.status).toBe("published");
    expect(post.format).toBe("markdown");
    expect(post.terms.map((t: any) => t.taxonomy).sort()).toEqual(["category", "tag"]);

    // Re-applying with sample content on does not duplicate or clobber.
    const again = unwrap(await h.call(ADMIN, "template.apply", { slug: "magazine", mode: "replace", includeSampleContent: true }));
    expect(again.createdPosts).toEqual([]);
    expect(unwrap(await h.call(ADMIN, "post.list", { type: "post" })).items.length).toBe(3);
    h.cleanup();
  });

  test("settings are applied only in replace mode", async () => {
    const h = makeHarness();
    unwrap(await h.call(ADMIN, "settings.update", { siteTitle: "Mine", tagline: "Mine too" }));

    const merged = unwrap(await h.call(ADMIN, "template.apply", { slug: "local-business", mode: "merge" }));
    expect(merged.settingsApplied).toBe(false);
    expect(unwrap(await h.call(ADMIN, "settings.get", {})).siteTitle).toBe("Mine");

    const replaced = unwrap(await h.call(ADMIN, "template.apply", { slug: "local-business", mode: "replace" }));
    expect(replaced.settingsApplied).toBe(true);
    const s = unwrap(await h.call(ADMIN, "settings.get", {}));
    expect(s.siteTitle).toBe("Corner");
    expect(s.tagline).toContain("Mill Street");
    h.cleanup();
  });
});

describe("bundled media", () => {
  test("template:// refs upload once and are reused on re-apply", async () => {
    const h = makeHarness();
    const first = unwrap(await h.call(ADMIN, "template.apply", { template: mediaTemplate({ withAsset: true }), mode: "replace" }));
    expect(first.mediaUploaded).toBe(1);

    const page = unwrap(await h.call(ADMIN, "post.get", { slug: "gallery-page" }));
    const url = page.blocks.blocks[0].props.image.url as string;
    expect(url.startsWith("/media/")).toBe(true);
    expect(url.endsWith("-dot.png")).toBe(true);

    const library = unwrap(await h.call(ADMIN, "media.list", {}));
    expect(library.items.length).toBe(1);

    // Second apply: the filename already exists, so it is reused rather than re-uploaded.
    const second = unwrap(await h.call(ADMIN, "template.apply", { template: mediaTemplate({ withAsset: true }), mode: "replace" }));
    expect(second.mediaUploaded).toBe(0);
    expect(unwrap(await h.call(ADMIN, "media.list", {})).items.length).toBe(1);
    const again = unwrap(await h.call(ADMIN, "post.get", { slug: "gallery-page" }));
    expect(again.blocks.blocks[0].props.image.url).toBe(url);
    h.cleanup();
  });

  test("an unresolvable template:// reference is a 400", async () => {
    const h = makeHarness();
    const r = await h.call(ADMIN, "template.apply", { template: mediaTemplate({ withAsset: false }), mode: "replace" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(400);
      expect(r.error.message).toContain("template://dot.png");
    }
    // Nothing was written.
    expect((await h.call(ADMIN, "post.get", { slug: "gallery-page" })).ok).toBe(false);
    h.cleanup();
  });
});

describe("template.export", () => {
  test("round-trips: export validates and applies unchanged on a fresh site", async () => {
    const source = makeHarness();
    // The media template carries no design of its own, so apply it first: the last
    // replace wins, and the site ends up on Corner's design with an extra image page.
    unwrap(await source.call(ADMIN, "template.apply", { template: mediaTemplate({ withAsset: true }), mode: "replace" }));
    unwrap(await source.call(ADMIN, "template.apply", { slug: "local-business", mode: "replace", includeSampleContent: true }));
    unwrap(await source.call(ADMIN, "post.create", {
      type: "post", slug: "a-note", title: "A note", content: "# Hello\n\nSome prose.", status: "published",
    }));

    const exported: SiteTemplateT = unwrap(await source.call(ADMIN, "template.export", { includeContent: true }));
    expect(SiteTemplate.safeParse(exported).success).toBe(true);
    expect(exported.meta.slug).toBe("corner");
    expect(exported.settings?.siteTitle).toBe("Corner");
    expect(exported.pages.map((p) => p.slug).sort()).toEqual(["about", "contact", "gallery-page", "home", "menu"]);
    expect(exported.menus.map((m) => m.location)).toEqual(["header", "footer"]);
    expect(exported.design.colors.accent).toBe("#15803d");
    expect(exported.samplePosts.map((p) => p.slug)).toContain("a-note");
    expect(exported.media.length).toBe(1);
    expect(exported.media[0]!.mime).toBe("image/png");

    // Page image urls come back as template:// references, resolvable from the bundle.
    const gallery = exported.pages.find((p) => p.slug === "gallery-page")!;
    const ref = collectImageUrls(gallery.blocks)[0]!;
    expect(ref.startsWith("template://")).toBe(true);
    expect(exported.media.map((m) => m.name)).toContain(ref.slice("template://".length));

    // Unchanged, the export is a valid input to apply.
    const target = makeHarness();
    const report = unwrap(await target.call(ADMIN, "template.apply", {
      template: exported, mode: "replace", includeSampleContent: true,
    }));
    expect(report.createdPages.sort()).toEqual(["about", "contact", "gallery-page", "home", "menu"]);
    expect(report.mediaUploaded).toBe(1);
    expect(report.createdPosts).toContain("a-note");
    expect(unwrap(await target.call(ADMIN, "settings.get", {})).siteTitle).toBe("Corner");
    expect(unwrap(await target.call(ADMIN, "design.get", {})).colors.accent).toBe("#15803d");

    const landed = unwrap(await target.call(ADMIN, "post.get", { slug: "gallery-page" }));
    const landedUrl = landed.blocks.blocks[0].props.image.url as string;
    expect(landedUrl.startsWith("/media/")).toBe(true);
    expect(landedUrl.startsWith("template://")).toBe(false);

    const menuPage = unwrap(await target.call(ADMIN, "post.get", { slug: "menu" }));
    expect(menuPage.blocks.blocks.map((b: any) => b.type)).toEqual(["hero", "columns", "cta"]);
    target.cleanup();
    source.cleanup();
  });

  test("a site with no published block pages cannot be exported", async () => {
    const h = makeHarness();
    const r = await h.call(ADMIN, "template.export", {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
    h.cleanup();
  });
});
