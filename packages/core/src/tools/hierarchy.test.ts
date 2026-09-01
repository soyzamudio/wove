import { describe, expect, test } from "bun:test";
import { ADMIN, makeHarness, unwrap } from "../test-helpers";

const h = makeHarness();
const req = (path: string) => h.app.fetch(new Request(`http://localhost:4000${path}`));
const call = (name: string, input?: unknown) => h.call(ADMIN, name, input);

const page = async (title: string, extra: Record<string, unknown> = {}) =>
  unwrap(await call("post.create", { type: "page", title, status: "published", ...extra }));

describe("path computation", () => {
  test("a post uses the permalink pattern, and follows settings.update", async () => {
    const p = unwrap(await call("post.create", { title: "Hello Wove", status: "published" }));
    expect(p.path).toBe("/hello-wove");
    expect(p.parentId).toBe(null);

    const settings = unwrap(await call("settings.update", { postPermalink: "/blog/:slug" }));
    expect(settings.postPermalink).toBe("/blog/:slug");

    const again = unwrap(await call("post.get", { id: p.id }));
    expect(again.path).toBe("/blog/hello-wove");

    // pages are never prefixed
    const about = await page("About");
    expect(about.path).toBe("/about");

    unwrap(await call("settings.update", { postPermalink: "/:slug" }));
    expect(unwrap(await call("post.get", { id: p.id })).path).toBe("/hello-wove");
  });

  test("a nested page's path is its ancestor slug chain", async () => {
    const services = await page("Services");
    const consulting = await page("Consulting", { parentId: services.id });
    const retainers = await page("Retainers", { parentId: consulting.id });

    expect(consulting.path).toBe("/services/consulting");
    expect(retainers.path).toBe("/services/consulting/retainers");

    // post.list serialises parentId + path
    const { items } = unwrap(await call("post.list", { type: "page", limit: 100 }));
    const found = items.find((i: any) => i.id === retainers.id);
    expect(found.parentId).toBe(consulting.id);
    expect(found.path).toBe("/services/consulting/retainers");
  });
});

describe("parentId validation", () => {
  test("posts cannot have a parent", async () => {
    const parent = await page("Parent A");
    const r = await call("post.create", { title: "A post", parentId: parent.id });
    expect(r.ok).toBe(false);
    expect((r as any).error.code).toBe("validation_error");
  });

  test("the parent must exist and be a page", async () => {
    const missing = await call("post.create", { type: "page", title: "Orphan", parentId: "nope" });
    expect(missing.ok).toBe(false);

    const post = unwrap(await call("post.create", { title: "Not a page" }));
    const wrongType = await call("post.create", { type: "page", title: "Child of post", parentId: post.id });
    expect(wrongType.ok).toBe(false);
  });

  test("a page cannot be its own parent, nor parent one of its own ancestors", async () => {
    const top = await page("Top");
    const mid = await page("Mid", { parentId: top.id });

    const self = await call("post.update", { id: top.id, parentId: top.id });
    expect(self.ok).toBe(false);

    const cycle = await call("post.update", { id: top.id, parentId: mid.id });
    expect(cycle.ok).toBe(false);
    expect((cycle as any).error.message).toMatch(/cycle/i);
  });

  test("the hierarchy is capped at three levels", async () => {
    const l1 = await page("L1");
    const l2 = await page("L2", { parentId: l1.id });
    const l3 = await page("L3", { parentId: l2.id });
    const l4 = await call("post.create", { type: "page", title: "L4", parentId: l3.id });
    expect(l4.ok).toBe(false);
    expect((l4 as any).error.message).toMatch(/3 levels/);

    // moving a two-deep subtree under a two-deep parent would make it four deep
    const other = await page("Other");
    const otherChild = await page("Other Child", { parentId: other.id });
    const move = await call("post.update", { id: l1.id, parentId: otherChild.id });
    expect(move.ok).toBe(false);
  });
});

describe("GET /api/public/path", () => {
  test("resolves a page only through its exact ancestor chain", async () => {
    const services = await page("Svc", { slug: "svc" });
    await page("Advice", { slug: "advice", parentId: services.id });

    const hit = await (await req("/api/public/path?p=/svc/advice")).json();
    expect(hit.post.slug).toBe("advice");
    expect(hit.post.path).toBe("/svc/advice");

    expect((await (await req("/api/public/path?p=/wrong/advice")).json()).post).toBe(null);
    expect((await (await req("/api/public/path?p=/advice")).json()).post).toBe(null);
    expect((await (await req("/api/public/path?p=/")).json()).post).toBe(null);
    // the unique-slug endpoint is unaffected
    expect((await req("/api/public/posts/advice")).status).toBe(200);
  });

  test("honours the post permalink prefix", async () => {
    const p = unwrap(await call("post.create", { title: "Prefixed", slug: "prefixed", status: "published" }));
    expect((await (await req("/api/public/path?p=/prefixed")).json()).post.id).toBe(p.id);
    expect((await (await req("/api/public/path?p=/blog/prefixed")).json()).post).toBe(null);

    unwrap(await call("settings.update", { postPermalink: "/blog/:slug" }));
    expect((await (await req("/api/public/path?p=/blog/prefixed")).json()).post.id).toBe(p.id);
    expect((await (await req("/api/public/path?p=/prefixed")).json()).post).toBe(null);
    unwrap(await call("settings.update", { postPermalink: "/:slug" }));
  });

  test("drafts are invisible", async () => {
    unwrap(await call("post.create", { type: "page", title: "Hidden", slug: "hidden", status: "draft" }));
    expect((await (await req("/api/public/path?p=/hidden")).json()).post).toBe(null);
  });
});
