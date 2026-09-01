import { afterAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { BlocksDoc, Post } from "@wove/sdk";
import { posts } from "../db/schema";
import { ADMIN, makeHarness, unwrap } from "../test-helpers";

const h = makeHarness();
afterAll(() => h.cleanup());

const hero = (over: Record<string, unknown> = {}) => ({
  type: "hero",
  props: {
    headline: "Ship pages agents can edit",
    subheadline: "Typed blocks, validated on write, rendered by the site.",
    ...over,
  },
});

const doc = (...blocks: unknown[]) => ({ version: 1, blocks });

describe("post.create / post.get with blocks", () => {
  test("stores the document and reads it back parsed", async () => {
    const created = unwrap<Post>(await h.call(ADMIN, "post.create", {
      type: "page",
      title: "Blocks Page",
      blocks: doc(hero(), { type: "cta", props: { headline: "Get started", buttons: [{ label: "Go", href: "/x" }] } }),
    }));
    expect(created.format).toBe("blocks");
    expect(created.blocks?.blocks.length).toBe(2);
    expect(JSON.parse(created.content).blocks[0].type).toBe("hero");

    const fetched = unwrap<Post>(await h.call(ADMIN, "post.get", { id: created.id }));
    expect(fetched.format).toBe("blocks");
    expect(fetched.blocks?.blocks[1]!.type).toBe("cta");
    // zod defaults are materialised on the way in
    expect((fetched.blocks!.blocks[0]!.props as any).layout).toBe("split");
  });

  test("assigns ids to blocks that arrive without one", async () => {
    const created = unwrap<Post>(await h.call(ADMIN, "post.create", {
      type: "page", title: "Auto Ids", blocks: doc(hero(), hero({ headline: "Second" })),
    }));
    const ids = created.blocks!.blocks.map((b) => b.id);
    expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(2);
  });

  test("keeps an id the caller supplied", async () => {
    const created = unwrap<Post>(await h.call(ADMIN, "post.create", {
      type: "page", title: "Kept Id", blocks: doc({ id: "keep-me", ...hero() }),
    }));
    expect(created.blocks!.blocks[0]!.id).toBe("keep-me");
  });

  test("derives the excerpt from the hero when none is given", async () => {
    const created = unwrap<Post>(await h.call(ADMIN, "post.create", {
      type: "page", title: "Excerpted", blocks: doc(hero()),
    }));
    expect(created.excerpt).toBe("Typed blocks, validated on write, rendered by the site.");
  });

  test("falls back to the first markdown block, truncated", async () => {
    const long = "word ".repeat(80);
    const created = unwrap<Post>(await h.call(ADMIN, "post.create", {
      type: "page", title: "Long Prose", blocks: doc({ type: "markdown", props: { markdown: `# Heading\n\n${long}` } }),
    }));
    expect(created.excerpt!.length).toBeLessThanOrEqual(161);
    expect(created.excerpt!.endsWith("…")).toBe(true);
  });

  test("an explicit excerpt wins", async () => {
    const created = unwrap<Post>(await h.call(ADMIN, "post.create", {
      type: "page", title: "Own Excerpt", excerpt: "Mine.", blocks: doc(hero()),
    }));
    expect(created.excerpt).toBe("Mine.");
  });

  test("rejects an invalid blocks document with 400", async () => {
    const r = await h.call(ADMIN, "post.create", {
      type: "page", title: "Bad", blocks: doc({ type: "hero", props: {} }),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(400);
      expect(r.error.code).toBe("validation_error");
    }
  });

  test("rejects an unknown block type with 400", async () => {
    const r = await h.call(ADMIN, "post.create", {
      type: "page", title: "Bad Type", blocks: doc({ type: "carousel", props: {} }),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  test("format:'blocks' with a JSON content string is parsed and normalised", async () => {
    const created = unwrap<Post>(await h.call(ADMIN, "post.create", {
      type: "page", title: "From String", format: "blocks", content: JSON.stringify(doc(hero())),
    }));
    expect(created.format).toBe("blocks");
    expect(created.blocks!.blocks[0]!.id.length).toBeGreaterThan(0);
  });

  test("format:'blocks' with non-JSON content is 400", async () => {
    const r = await h.call(ADMIN, "post.create", { type: "page", title: "Not JSON", format: "blocks", content: "# hi" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  test("markdown posts are unchanged: format markdown, blocks null", async () => {
    const created = unwrap<Post>(await h.call(ADMIN, "post.create", { title: "Plain", content: "# Hi" }));
    expect(created.format).toBe("markdown");
    expect(created.blocks).toBe(null);
    expect(created.content).toBe("# Hi");
  });
});

describe("post.update with blocks", () => {
  test("converts a markdown post, snapshots the old content as a revision", async () => {
    const created = unwrap<Post>(await h.call(ADMIN, "post.create", { type: "page", title: "Convert", content: "# Old" }));
    const updated = unwrap<Post>(await h.call(ADMIN, "post.update", { id: created.id, blocks: doc(hero()) }));
    expect(updated.format).toBe("blocks");
    expect(updated.blocks!.blocks.length).toBe(1);

    const revs = unwrap<{ content: string }[]>(await h.call(ADMIN, "post.revisions", { id: created.id }));
    expect(revs.length).toBe(1);
    expect(revs[0]!.content).toBe("# Old");
  });

  test("format:'markdown' on a blocks post leaves the content alone", async () => {
    const created = unwrap<Post>(await h.call(ADMIN, "post.create", { type: "page", title: "Back To MD", blocks: doc(hero()) }));
    const updated = unwrap<Post>(await h.call(ADMIN, "post.update", { id: created.id, format: "markdown" }));
    expect(updated.format).toBe("markdown");
    expect(updated.blocks).toBe(null);
    expect(updated.content).toBe(created.content);
  });

  test("does not clobber an author-written excerpt", async () => {
    const created = unwrap<Post>(await h.call(ADMIN, "post.create", {
      type: "page", title: "Sticky Excerpt", excerpt: "Hand written.", content: "x",
    }));
    const updated = unwrap<Post>(await h.call(ADMIN, "post.update", { id: created.id, blocks: doc(hero()) }));
    expect(updated.excerpt).toBe("Hand written.");
  });
});

describe("corrupt documents", () => {
  test("a post whose stored JSON is invalid reads as an empty document, not a 500", async () => {
    const created = unwrap<Post>(await h.call(ADMIN, "post.create", { type: "page", title: "Corrupt", blocks: doc(hero()) }));
    h.db.update(posts).set({ content: "{not json" }).where(eq(posts.id, created.id)).run();
    const fetched = unwrap<Post>(await h.call(ADMIN, "post.get", { id: created.id }));
    expect(fetched.format).toBe("blocks");
    expect(fetched.blocks).toEqual({ version: 1, blocks: [] });
  });
});

describe("public API", () => {
  test("GET /api/public/posts/:slug returns format + blocks", async () => {
    unwrap<Post>(await h.call(ADMIN, "post.create", {
      type: "page", slug: "public-blocks", title: "Public Blocks", status: "published", blocks: doc(hero()),
    }));
    const res = await h.app.request("/api/public/posts/public-blocks");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Post;
    expect(body.format).toBe("blocks");
    expect(body.blocks!.blocks[0]!.type).toBe("hero");

    const list = (await (await h.app.request("/api/public/posts?type=page")).json()) as { items: Post[] };
    const found = list.items.find((p) => p.slug === "public-blocks")!;
    expect(found.blocks!.blocks.length).toBe(1);
  });
});

describe("block.catalog / block.validate", () => {
  test("catalog lists every block type with a props schema", async () => {
    const cat = unwrap<{ type: string; name: string; description: string; propsSchema: any }[]>(
      await h.call(ADMIN, "block.catalog", {}),
    );
    expect(cat.length).toBe(13);
    expect(cat.map((c) => c.type)).toContain("hero");
    expect(cat.map((c) => c.type)).toContain("html");
    const heroEntry = cat.find((c) => c.type === "hero")!;
    expect(heroEntry.name).toBe("Hero");
    expect(heroEntry.description.length).toBeGreaterThan(0);
    expect(heroEntry.propsSchema.type).toBe("object");
    expect(Object.keys(heroEntry.propsSchema.properties)).toContain("headline");
    expect(cat.every((c) => (c.propsSchema as any)?.type === "object")).toBe(true);
  });

  test("validate fills ids and defaults", async () => {
    const r = unwrap<{ ok: true; doc: BlocksDoc }>(await h.call(ADMIN, "block.validate", {
      doc: { blocks: [{ type: "hero", props: { headline: "H" } }] },
    }));
    expect(r.ok).toBe(true);
    expect(r.doc.version).toBe(1);
    expect(r.doc.blocks[0]!.id.length).toBeGreaterThan(0);
    expect((r.doc.blocks[0]!.props as any).layout).toBe("split");
    expect((r.doc.blocks[0]!.props as any).buttons).toEqual([]);
  });

  test("validate rejects a bad document", async () => {
    const r = await h.call(ADMIN, "block.validate", { doc: { blocks: [{ type: "stats", props: { items: [] } }] } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });
});
