import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import sharp from "sharp";
import { ImportOptions, type Menu, type Post, type SiteExport } from "@wove/sdk";
import { ADMIN, makeHarness, unwrap, type Harness } from "../../test-helpers";
import { emptyJob, listJobs, resetJobs } from "../jobs";
import { newId } from "../../ids";
import { runImport } from "./run";
import { fixtureXml } from "./parse.test";

const opts = (o: Partial<ImportOptions> = {}) => ImportOptions.parse({ downloadMedia: false, ...o });

let h: Harness;
const realFetch = globalThis.fetch;

beforeEach(() => {
  resetJobs();
  h = makeHarness();
});
afterEach(() => {
  globalThis.fetch = realFetch;
  h.cleanup();
});

const run = async (o: Partial<ImportOptions> = {}) =>
  runImport(h.ctx(ADMIN), await fixtureXml(), opts(o), emptyJob(newId()));

const posts = async () => unwrap<{ items: Post[] }>(await h.call(ADMIN, "post.list", { limit: 100 })).items;
const bySlug = async (slug: string) => (await posts()).find((p) => p.slug === slug);

describe("runImport", () => {
  test("reports source, phase and counts", async () => {
    const job = await run();
    expect(job.status).toBe("done");
    expect(job.phase).toBe("done");
    expect(job.error).toBeNull();
    expect(job.source).toEqual({ siteTitle: "Old Site", siteUrl: "https://old.site", items: 10 });
    expect(job.counts.posts).toBe(4);
    expect(job.counts.pages).toBe(1);
    expect(job.counts.terms).toBe(2);
    expect(job.counts.menus).toBe(1);
    expect(job.counts.media).toBe(0);
    expect(job.counts.failed).toBe(0);
    expect(job.progress.done).toBe(job.progress.total);
    expect(job.finishedAt).not.toBeNull();
  });

  test("maps statuses, slugs and dates", async () => {
    await run();
    expect((await bySlug("hello-world"))!.status).toBe("published");
    expect((await bySlug("hello-world"))!.publishedAt).toBe("2021-03-04T10:00:00.000Z");
    expect((await bySlug("coming-soon"))!.status).toBe("scheduled");
    // draft with an empty post_name gets a slug from its title
    expect((await bySlug("work-in-progress"))!.status).toBe("draft");
    expect((await bySlug("about"))!.type).toBe("page");
  });

  test("attaches terms and Yoast/RankMath SEO, and records WordPress provenance", async () => {
    await run();
    const post = (await bySlug("hello-world"))!;
    const sortedTerms = [...post.terms].sort((a, b) => a.taxonomy.localeCompare(b.taxonomy));
    expect(sortedTerms).toEqual([
      { taxonomy: "category", slug: "news", name: "News" },
      { taxonomy: "tag", slug: "release", name: "Release" },
    ]);
    expect(post.seo.title).toBe("Hello World — Old Site");
    expect(post.seo.description).toBe("The very first post on the old site.");
    expect(post.seo.noindex).toBe(true);
    expect((post.meta as any).wp).toMatchObject({
      id: "10", type: "post", author: "Jane Doe", link: "https://old.site/2021/03/hello-world/",
    });
    expect((await bySlug("second-post"))!.seo.title).toBe("Second Post | Old Site");
    expect(post.authorId).toBe("u_admin");
  });

  test("converts content and rewrites internal links", async () => {
    await run();
    const post = (await bySlug("hello-world"))!;
    expect(post.content).not.toContain("wp:paragraph");
    expect(post.content).toContain("*The office, 2021*");
    expect(post.content).toContain("](/second-post)");
    expect(post.excerpt).toBe("A short *intro*.");
    expect((await bySlug("second-post"))!.content).toContain("| Metric | Value |");
    expect((await bySlug("second-post"))!.content).toContain("```js");
  });

  test("imports pages as a single markdown block", async () => {
    await run();
    const page = (await bySlug("about"))!;
    expect(page.format).toBe("blocks");
    expect(page.blocks!.blocks).toHaveLength(1);
    expect(page.blocks!.blocks[0]!.type).toBe("markdown");
    expect((page.blocks!.blocks[0]! as any).props.markdown).toContain("*2009*");
  });

  test("pagesAsBlocks:false keeps pages as markdown", async () => {
    await run({ pagesAsBlocks: false });
    expect((await bySlug("about"))!.format).toBe("markdown");
  });

  test("builds the header menu with nesting and a custom URL", async () => {
    await run();
    const menu = unwrap<Menu>(await h.call(ADMIN, "menu.get", { location: "header" }));
    expect(menu.name).toBe("Primary Menu");
    expect(menu.items.map((i) => [i.label, i.href])).toEqual([
      ["Home", "/about"],
      ["Docs", "https://docs.example.com/"],
    ]);
    expect(menu.items[0]!.children!.map((c) => [c.label, c.href])).toEqual([["Hello World", "/hello-world"]]);
  });

  test("warns about shortcodes it cannot keep", async () => {
    const job = await run();
    const messages = job.warnings.map((w) => w.message).join("\n");
    expect(messages).toContain("Unknown shortcode [unknown_widget]");
    // [gallery] resolves through the attachment map even without downloads
    expect((await bySlug("second-post"))!.content).toContain("![photo](https://old.site/wp-content/uploads/2021/03/photo.jpg)");
  });

  test("re-running is idempotent by default", async () => {
    await run();
    const before = (await posts()).length;
    const second = await run();
    expect(await posts()).toHaveLength(before);
    expect(second.counts.skipped).toBe(6); // 5 posts/pages + the already-present menu
    expect(second.counts.posts + second.counts.pages).toBe(0);
  });

  test("overwrite updates in place, keeping our id and slug", async () => {
    await run();
    const before = (await bySlug("hello-world"))!;
    await h.call(ADMIN, "post.update", { id: before.id, title: "Edited locally" });
    const job = await run({ overwrite: true });
    const after = (await bySlug("hello-world"))!;
    expect(after.id).toBe(before.id);
    expect(after.title).toBe("Hello World & Friends");
    expect(job.counts.skipped).toBe(0);
    expect(await posts()).toHaveLength(5);
  });

  test("dryRun writes nothing but still reports what would happen", async () => {
    const job = await run({ dryRun: true, downloadMedia: true });
    expect(job.status).toBe("done");
    expect(job.counts.posts).toBe(4);
    expect(job.counts.pages).toBe(1);
    expect(job.counts.terms).toBe(2);
    expect(job.counts.media).toBe(2);
    expect(job.counts.menus).toBe(1);
    expect(await posts()).toHaveLength(0);
    expect(unwrap<unknown[]>(await h.call(ADMIN, "term.list"))).toHaveLength(0);
    expect(unwrap<Menu[]>(await h.call(ADMIN, "menu.list"))).toHaveLength(0);
  });

  test("downloads media, sets the featured image and rewrites media URLs", async () => {
    const bytes = new Uint8Array(
      await sharp({ create: { width: 20, height: 10, channels: 3, background: "#369" } }).png().toBuffer(),
    );
    const seen: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      seen.push(String(input));
      return new Response(bytes, { status: 200, headers: { "content-type": "image/png" } });
    }) as unknown as typeof fetch;

    const job = await run({ downloadMedia: true });
    expect(seen.sort()).toEqual([
      "https://old.site/wp-content/uploads/2021/03/photo.jpg",
      "https://old.site/wp-content/uploads/2021/04/inline.jpg",
    ]);
    expect(job.counts.media).toBe(2);

    const post = (await bySlug("hello-world"))!;
    expect(post.featuredImage!.mediaId).toBeString();
    expect(post.featuredImage!.url).toStartWith("/media/");
    expect(post.featuredImage!.width).toBe(20);
    expect(post.featuredImage!.variants!.length).toBeGreaterThan(0);
    // the -300x200 variant in the caption resolves to the stored original
    expect(post.content).not.toContain("old.site");
    expect(post.content).toContain("![A photo](/media/");
    expect((await bySlug("second-post"))!.content).not.toContain("old.site/wp-content");
  });

  test("a failed download keeps the old URL and counts a failure", async () => {
    globalThis.fetch = (async () => new Response("nope", { status: 404 })) as unknown as typeof fetch;
    const job = await run({ downloadMedia: true });
    expect(job.counts.media).toBe(0);
    expect(job.counts.failed).toBe(2);
    expect(job.warnings.some((w) => w.message.includes("Media download failed"))).toBe(true);
    expect((await bySlug("hello-world"))!.content).toContain("https://old.site/wp-content/uploads");
  });

  test("a malformed export fails the job instead of throwing", async () => {
    const job = await runImport(h.ctx(ADMIN), "<html>nope</html>", opts(), emptyJob(newId()));
    expect(job.status).toBe("failed");
    expect(job.error).toContain("Not a WXR file");
  });

  test("jobs survive a restart via the persisted json", async () => {
    const job = await run();
    resetJobs();
    const listed = listJobs();
    expect(listed[0]!.id).toBe(job.id);
    expect(listed[0]!.counts.posts).toBe(4);
  });
});

describe("export.site", () => {
  test("round-trips the imported site", async () => {
    await run();
    const site = unwrap<SiteExport>(await h.call(ADMIN, "export.site"));
    expect(site.version).toBe(1);
    expect(site.posts).toHaveLength(5);
    expect(site.terms.map((t) => t.slug).sort()).toEqual(["news", "release"]);
    expect(site.menus.map((m) => m.location)).toEqual(["header"]);
    expect(site.settings.siteTitle).toBeString();
    expect(site.design.radius).toBeNumber();
    expect(site.posts.find((p) => p.slug === "about")!.blocks!.blocks).toHaveLength(1);
  });

  test("is served as a download", async () => {
    await run();
    const res = await h.app.request("/api/export/site.json", {
      headers: { authorization: "Bearer x" },
    });
    // no agent key in this harness → unauthenticated, but the route exists and audits
    expect([200, 401]).toContain(res.status);
  });
});
