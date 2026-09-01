import { describe, expect, test } from "bun:test";
import { ADMIN, makeHarness, unwrap } from "../test-helpers";

const h = makeHarness();
const slugs = (r: any) => r.items.map((p: any) => p.slug);

describe("trash", () => {
  test("delete trashes, list hides it, status:'trashed' lists it, restore brings it back", async () => {
    const p = unwrap(await h.call(ADMIN, "post.create", { title: "Throwaway", status: "published" }));
    const seen: string[] = [];
    h.hooks.on("post.trash", () => void seen.push("trash"));
    h.hooks.on("post.restore", () => void seen.push("restore"));

    const del = unwrap(await h.call(ADMIN, "post.delete", { id: p.id }));
    expect(del).toEqual({ ok: true, trashed: true });

    const trashedRow = unwrap(await h.call(ADMIN, "post.get", { id: p.id }));
    expect(trashedRow.status).toBe("trashed");

    expect(slugs(unwrap(await h.call(ADMIN, "post.list", {})))).not.toContain("throwaway");
    expect(slugs(unwrap(await h.call(ADMIN, "post.list", { status: "trashed" })))).toContain("throwaway");

    const restored = unwrap(await h.call(ADMIN, "post.restore", { id: p.id }));
    expect(restored.status).toBe("draft");
    expect(slugs(unwrap(await h.call(ADMIN, "post.list", {})))).toContain("throwaway");
    expect(seen).toEqual(["trash", "restore"]);
  });

  test("permanent delete removes the row and its revisions", async () => {
    const p = unwrap(await h.call(ADMIN, "post.create", { title: "Gone for good", content: "a" }));
    unwrap(await h.call(ADMIN, "post.update", { id: p.id, content: "b" }));
    expect(unwrap(await h.call(ADMIN, "post.revisions", { id: p.id })).length).toBe(1);

    const del = unwrap(await h.call(ADMIN, "post.delete", { id: p.id, permanent: true }));
    expect(del).toEqual({ ok: true, trashed: false });
    expect((await h.call(ADMIN, "post.get", { id: p.id })).ok).toBe(false);
  });

  test("a trashed post keeps its slug; a new post with the same title de-dupes", async () => {
    const a = unwrap(await h.call(ADMIN, "post.create", { title: "Recycled title" }));
    await h.call(ADMIN, "post.delete", { id: a.id });
    const b = unwrap(await h.call(ADMIN, "post.create", { title: "Recycled title" }));
    expect(a.slug).toBe("recycled-title");
    expect(b.slug).toBe("recycled-title-2");
  });

  test("bulk publishes many posts and reports the affected count", async () => {
    const ids = [];
    for (const t of ["Bulk one", "Bulk two", "Bulk three"]) {
      ids.push(unwrap(await h.call(ADMIN, "post.create", { title: t })).id);
    }
    const r = unwrap(await h.call(ADMIN, "post.bulk", { ids, action: "publish" }));
    expect(r).toEqual({ ok: true, affected: 3 });
    for (const id of ids) {
      const p = unwrap(await h.call(ADMIN, "post.get", { id }));
      expect(p.status).toBe("published");
      expect(p.publishedAt).toBeTruthy();
    }
  });

  test("bulk trash + emptyTrash purges everything in the trash", async () => {
    const ids = [];
    for (const t of ["Purge one", "Purge two"]) {
      ids.push(unwrap(await h.call(ADMIN, "post.create", { title: t })).id);
    }
    expect(unwrap(await h.call(ADMIN, "post.bulk", { ids, action: "trash" })).affected).toBe(2);
    const inTrash = unwrap(await h.call(ADMIN, "post.list", { status: "trashed", limit: 100 })).items.length;
    expect(inTrash).toBeGreaterThanOrEqual(2);

    const emptied = unwrap(await h.call(ADMIN, "post.emptyTrash", {}));
    expect(emptied.deleted).toBe(inTrash);
    expect(unwrap(await h.call(ADMIN, "post.list", { status: "trashed" })).items).toEqual([]);
    for (const id of ids) expect((await h.call(ADMIN, "post.get", { id })).ok).toBe(false);
  });

  test("post.bulk is audited once per call, not once per post", async () => {
    const before = unwrap(await h.call(ADMIN, "audit.list", { tool: "post.bulk", limit: 200 })).items.length;
    const ids = [];
    for (const t of ["Audited bulk a", "Audited bulk b", "Audited bulk c"]) {
      ids.push(unwrap(await h.call(ADMIN, "post.create", { title: t })).id);
    }
    await h.call(ADMIN, "post.bulk", { ids, action: "draft" });
    const after = unwrap(await h.call(ADMIN, "audit.list", { tool: "post.bulk", limit: 200 })).items;
    expect(after.length - before).toBe(1);
    expect(after[0].input).toMatchObject({ action: "draft" });
  });
});

describe("featured image + seo", () => {
  test("defaults, create, and a partial seo patch on update", async () => {
    const bare = unwrap(await h.call(ADMIN, "post.create", { title: "Bare" }));
    expect(bare.featuredImage).toBeNull();
    expect(bare.seo).toEqual({ title: null, description: null, ogImage: null, noindex: false });

    const p = unwrap(await h.call(ADMIN, "post.create", {
      title: "Decorated",
      featuredImage: { url: "/media/hero.png", alt: "Hero" },
      seo: { description: "A described post", noindex: true },
    }));
    expect(p.featuredImage).toMatchObject({ url: "/media/hero.png", alt: "Hero" });
    expect(p.seo.description).toBe("A described post");
    expect(p.seo.noindex).toBe(true);

    const patched = unwrap(await h.call(ADMIN, "post.update", { id: p.id, seo: { title: "SEO title" } }));
    expect(patched.seo.title).toBe("SEO title");
    expect(patched.seo.description).toBe("A described post"); // untouched by the patch
    expect(patched.seo.noindex).toBe(true);
    expect(patched.featuredImage).toMatchObject({ url: "/media/hero.png" });

    const cleared = unwrap(await h.call(ADMIN, "post.update", { id: p.id, featuredImage: null }));
    expect(cleared.featuredImage).toBeNull();
  });
});
