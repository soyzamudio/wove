import { describe, expect, test } from "bun:test";
import { ADMIN, makeHarness, unwrap } from "../test-helpers";

const h = makeHarness();

describe("post tools", () => {
  test("derives a slug from the title and de-dupes with -2, -3", async () => {
    const a = unwrap(await h.call(ADMIN, "post.create", { title: "Hello World!" }));
    const b = unwrap(await h.call(ADMIN, "post.create", { title: "Hello World" }));
    const c = unwrap(await h.call(ADMIN, "post.create", { title: "hello world" }));
    expect(a.slug).toBe("hello-world");
    expect(b.slug).toBe("hello-world-2");
    expect(c.slug).toBe("hello-world-3");
  });

  test("honours an explicit slug", async () => {
    const p = unwrap(await h.call(ADMIN, "post.create", { title: "Anything", slug: "explicit-slug" }));
    expect(p.slug).toBe("explicit-slug");
  });

  test("update snapshots the previous state as a revision", async () => {
    const p = unwrap(await h.call(ADMIN, "post.create", { title: "V1", content: "one" }));
    expect(unwrap<unknown[]>(await h.call(ADMIN, "post.revisions", { id: p.id }))).toEqual([]);

    const updated = unwrap(await h.call(ADMIN, "post.update", { id: p.id, title: "V2", content: "two" }));
    expect(updated.title).toBe("V2");

    const revs = unwrap(await h.call(ADMIN, "post.revisions", { id: p.id }));
    expect(revs.length).toBe(1);
    expect(revs[0].title).toBe("V1");
    expect(revs[0].content).toBe("one");

    unwrap(await h.call(ADMIN, "post.update", { id: p.id, content: "three" }));
    expect(unwrap(await h.call(ADMIN, "post.revisions", { id: p.id })).length).toBe(2);
  });

  test("publish now vs. schedule in the future", async () => {
    const p = unwrap(await h.call(ADMIN, "post.create", { title: "Publishable" }));
    expect(p.status).toBe("draft");

    const now = unwrap(await h.call(ADMIN, "post.publish", { id: p.id }));
    expect(now.status).toBe("published");
    expect(now.publishedAt).toBeTruthy();

    const at = new Date(Date.now() + 86_400_000).toISOString();
    const later = unwrap(await h.call(ADMIN, "post.publish", { id: p.id, at }));
    expect(later.status).toBe("scheduled");
    expect(later.publishedAt).toBe(at);
  });

  test("terms upsert by (taxonomy, slug) and are shared across posts", async () => {
    await h.call(ADMIN, "post.create", { title: "Tagged one", terms: [{ taxonomy: "tag", name: "Bun Runtime" }] });
    await h.call(ADMIN, "post.create", { title: "Tagged two", terms: [{ taxonomy: "tag", name: "bun runtime" }] });
    const terms = unwrap(await h.call(ADMIN, "term.list", { taxonomy: "tag" }));
    const t = terms.filter((x: any) => x.slug === "bun-runtime");
    expect(t.length).toBe(1);
    expect(t[0].count).toBe(2);
  });

  test("emits post.beforeSave / afterSave / publish hooks", async () => {
    const seen: string[] = [];
    h.hooks.on("post.beforeSave", () => void seen.push("before"));
    h.hooks.on("post.afterSave", () => void seen.push("after"));
    h.hooks.on("post.publish", () => void seen.push("publish"));
    const p = unwrap(await h.call(ADMIN, "post.create", { title: "Hooked" }));
    expect(seen).toEqual(["before", "after"]);
    await h.call(ADMIN, "post.publish", { id: p.id });
    expect(seen).toEqual(["before", "after", "publish"]);
  });

  test("post.get by slug, and 404 for a missing one", async () => {
    unwrap(await h.call(ADMIN, "post.create", { title: "Findable", slug: "findable" }));
    expect(unwrap(await h.call(ADMIN, "post.get", { slug: "findable" })).title).toBe("Findable");
    const r = await h.call(ADMIN, "post.get", { slug: "ghost" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(404);
  });

  test("settings merge stored values over SDK defaults", async () => {
    expect(unwrap(await h.call(ADMIN, "settings.get", {})).siteTitle).toBe("My agentpress site");
    const updated = unwrap(await h.call(ADMIN, "settings.update", { siteTitle: "Custom" }));
    expect(updated.siteTitle).toBe("Custom");
    expect(updated.postsPerPage).toBe(10); // default preserved
    expect(unwrap(await h.call(ADMIN, "settings.get", {})).siteTitle).toBe("Custom");
  });
});
