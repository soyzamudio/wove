import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Actor } from "@wove/sdk";
import { ADMIN, unwrap } from "../test-helpers";
import { openDb } from "../db";
import { Hooks } from "../hooks";
import { Registry, dispatch } from "./registry";
import { contentTools } from "./content";
import { redirectTools } from "./redirects";
import { notFoundLog, redirects } from "../db/schema";
import {
  NOT_FOUND_MAX_ROWS, evict404Overflow, notFoundReportLimiter, publicRedirectRoutes,
  record404, resolveRedirect, shouldReport404,
} from "./redirects";
import { registerRedirectListener } from "../redirect-listener";
import { nowIso } from "../ids";

/**
 * A local harness rather than `makeHarness`: this suite only needs the content and
 * redirect tools, and registering the whole catalog would couple it to tools that are
 * still being written in parallel.
 */
function makeRedirectHarness() {
  const dir = mkdtempSync(join(tmpdir(), "wove-redirects-"));
  const db = openDb(join(dir, "test.db"));
  const hooks = new Hooks();
  const registry = new Registry();
  for (const t of [...contentTools, ...redirectTools]) registry.register(t, { overwrite: true });
  return {
    db, hooks, registry, dir,
    call: (actor: Actor, name: string, input?: unknown) =>
      dispatch(name, input ?? {}, { actor, channel: "rest" as const, db, hooks, registry }, registry),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

let h: ReturnType<typeof makeRedirectHarness>;
beforeEach(() => {
  h = makeRedirectHarness();
  notFoundReportLimiter.reset();
});
afterEach(() => h.cleanup());

const create = (fromPath: string, toPath: string, code?: 301 | 302) =>
  h.call(ADMIN, "redirect.create", { fromPath, toPath, ...(code ? { code } : {}) });

describe("redirect tools", () => {
  test("create / list (newest first) / delete", async () => {
    const a = unwrap(await create("/old-a", "/hello"));
    const b = unwrap(await create("/old-b", "https://example.com/x", 302));
    expect(a.code).toBe(301);
    expect(a.source).toBe("manual");
    expect(b.code).toBe(302);

    const list = unwrap(await h.call(ADMIN, "redirect.list"));
    expect(list.map((r: any) => r.fromPath)).toEqual(["/old-b", "/old-a"]);

    unwrap(await h.call(ADMIN, "redirect.delete", { id: a.id }));
    expect(unwrap(await h.call(ADMIN, "redirect.list")).length).toBe(1);
    const gone = await h.call(ADMIN, "redirect.delete", { id: a.id });
    expect(gone.ok).toBe(false);
  });

  test("normalises a trailing slash", async () => {
    const r = unwrap(await create("/old/", "/hello/"));
    expect(r.fromPath).toBe("/old");
    expect(r.toPath).toBe("/hello");
  });

  test("rejects bad paths", async () => {
    for (const [from, to] of [
      ["old", "/hello"],
      ["https://evil.test/old", "/hello"],
      ["//evil.test", "/hello"],
      ["/o ld", "/hello"],
      ["/old", "hello"],
      ["/old", "ftp://x/y"],
      ["/old", ""],
    ] as const) {
      const r = await create(from, to);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("validation_error");
    }
  });

  test("duplicate fromPath is a 409", async () => {
    unwrap(await create("/old", "/hello"));
    const dup = await create("/old", "/other");
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.status).toBe(409);
  });

  test("rejects self-redirects and 2-hop loops", async () => {
    const self = await create("/a", "/a");
    expect(self.ok).toBe(false);
    unwrap(await create("/a", "/b"));
    const loop = await create("/b", "/a");
    expect(loop.ok).toBe(false);
    if (!loop.ok) expect(loop.error.code).toBe("validation_error");
  });
});

describe("resolve", () => {
  test("returns the target, counts the hit and clears the 404 entry", async () => {
    unwrap(await create("/old", "/hello", 302));
    record404(h.db, "/old");
    expect(h.db.select().from(notFoundLog).all().length).toBe(1);

    const hit = resolveRedirect(h.db, "/old/");
    expect(hit).toEqual({ toPath: "/hello", code: 302 });
    expect(h.db.select().from(redirects).all()[0]!.hits).toBe(1);
    expect(h.db.select().from(notFoundLog).all().length).toBe(0);

    expect(resolveRedirect(h.db, "/nope")).toBeNull();
  });

  test("GET /resolve over HTTP", async () => {
    unwrap(await create("/old", "/hello"));
    const app = publicRedirectRoutes(h.db);
    const res = await app.fetch(new Request("http://x/resolve?path=/old"));
    expect(await res.json()).toEqual({ redirect: { toPath: "/hello", code: 301 } });
    const miss = await app.fetch(new Request("http://x/resolve?path=/nope"));
    expect(await miss.json()).toEqual({ redirect: null });
    const none = await app.fetch(new Request("http://x/resolve"));
    expect(await none.json()).toEqual({ redirect: null });
  });
});

describe("404 log", () => {
  test("shouldReport404 filters assets, api, admin and well-known", () => {
    expect(shouldReport404("/some/page")).toBe(true);
    expect(shouldReport404("/page?x=1")).toBe(true);
    for (const p of [
      "/favicon.ico", "/a/b.png", "/style.css", "/app.js", "/app.js.map", "/robots.txt",
      "/sitemap.xml", "/x.webp", "/f.woff2", "/f.woff",
      "/api/public/posts", "/admin", "/admin/settings", "/.well-known/acme",
      "relative", "",
    ]) {
      expect(shouldReport404(p)).toBe(false);
    }
  });

  test("POST /404 upserts, counts and keeps the first referrer", async () => {
    const app = publicRedirectRoutes(h.db);
    const post = (body: unknown) =>
      app.fetch(new Request("http://x/404", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

    expect(await (await post({ path: "/gone", referrer: "https://a.test/" })).json()).toEqual({ ok: true });
    await post({ path: "/gone", referrer: "https://b.test/" });
    // filtered + malformed still answer ok, and write nothing
    expect(await (await post({ path: "/style.css" })).json()).toEqual({ ok: true });
    expect(await (await post({ nope: 1 })).json()).toEqual({ ok: true });
    const bad = await app.fetch(new Request("http://x/404", { method: "POST", body: "{" }));
    expect(await bad.json()).toEqual({ ok: true });

    const page = unwrap(await h.call(ADMIN, "notfound.list"));
    expect(page.items).toEqual([{ path: "/gone", count: 2, lastSeen: expect.any(String), referrer: "https://a.test/" }]);
  });

  test("caps the table and evicts the least-hit paths", () => {
    const ts = nowIso();
    const rows = Array.from({ length: NOT_FOUND_MAX_ROWS + 10 }, (_, i) => ({
      path: `/p-${i}`, count: i + 1, lastSeen: ts, referrer: null,
    }));
    h.db.insert(notFoundLog).values(rows).run();
    expect(evict404Overflow(h.db)).toBe(10);
    const left = h.db.select().from(notFoundLog).all();
    expect(left.length).toBe(NOT_FOUND_MAX_ROWS);
    expect(left.some((r) => r.path === "/p-0")).toBe(false);
    expect(left.some((r) => r.path === "/p-9")).toBe(false);
    expect(left.some((r) => r.path === "/p-10")).toBe(true);
    // record404 keeps enforcing the cap
    record404(h.db, "/fresh");
    expect(h.db.select().from(notFoundLog).all().length).toBe(NOT_FOUND_MAX_ROWS);
  });

  test("notfound.list orders by count desc and pages; notfound.clear", async () => {
    for (const [p, n] of [["/a", 3], ["/b", 7], ["/c", 1]] as const) {
      for (let i = 0; i < n; i++) record404(h.db, p);
    }
    const page1 = unwrap(await h.call(ADMIN, "notfound.list", { limit: 2 }));
    expect(page1.items.map((i: any) => i.path)).toEqual(["/b", "/a"]);
    expect(page1.nextCursor).toBeTruthy();
    const page2 = unwrap(await h.call(ADMIN, "notfound.list", { limit: 2, cursor: page1.nextCursor }));
    expect(page2.items.map((i: any) => i.path)).toEqual(["/c"]);
    expect(page2.nextCursor).toBeNull();

    expect(unwrap<{ ok: boolean; cleared: number }>(await h.call(ADMIN, "notfound.clear", { path: "/a" }))).toEqual({ ok: true, cleared: 1 });
    expect(unwrap<{ ok: boolean; cleared: number }>(await h.call(ADMIN, "notfound.clear", { path: "/a" }))).toEqual({ ok: true, cleared: 0 });
    expect(unwrap<{ ok: boolean; cleared: number }>(await h.call(ADMIN, "notfound.clear"))).toEqual({ ok: true, cleared: 2 });
  });
});

describe("slug-change listener", () => {
  const publish = async (slug: string) =>
    unwrap(await h.call(ADMIN, "post.create", { title: "Hello", slug, status: "published" }));

  test("creates a 301 and collapses chains", async () => {
    registerRedirectListener(h.hooks, h.db);
    const post = await publish("one");

    await h.call(ADMIN, "post.update", { id: post.id, slug: "two" });
    let list = unwrap(await h.call(ADMIN, "redirect.list"));
    expect(list as any[]).toEqual([expect.objectContaining({ fromPath: "/one", toPath: "/two", code: 301, source: "slug-change" })]);

    await h.call(ADMIN, "post.update", { id: post.id, slug: "three" });
    list = unwrap(await h.call(ADMIN, "redirect.list"));
    const byFrom = Object.fromEntries(list.map((r: any) => [r.fromPath, r.toPath]));
    expect(byFrom).toEqual({ "/one": "/three", "/two": "/three" });
  });

  test("ignores drafts, creations and non-slug edits", async () => {
    registerRedirectListener(h.hooks, h.db);
    const draft = unwrap(await h.call(ADMIN, "post.create", { title: "Draft", slug: "d-one", status: "draft" }));
    await h.call(ADMIN, "post.update", { id: draft.id, slug: "d-two" });
    const post = await publish("keep");
    await h.call(ADMIN, "post.update", { id: post.id, title: "Renamed" });
    expect(unwrap<any[]>(await h.call(ADMIN, "redirect.list"))).toEqual([]);
  });

  test("a redirect back to the new slug is not left self-pointing", async () => {
    registerRedirectListener(h.hooks, h.db);
    const post = await publish("one");
    unwrap(await create("/back", "/one"));
    await h.call(ADMIN, "post.update", { id: post.id, slug: "back" });
    const list = unwrap(await h.call(ADMIN, "redirect.list"));
    expect(list.map((r: any) => [r.fromPath, r.toPath])).toEqual([["/one", "/back"]]);
  });
});

describe("path-change listener (pages)", () => {
  const mkPage = async (title: string, slug: string, extra: Record<string, unknown> = {}) =>
    unwrap(await h.call(ADMIN, "post.create", { type: "page", title, slug, status: "published", ...extra }));

  test("renaming a parent redirects the parent and every published descendant", async () => {
    registerRedirectListener(h.hooks, h.db);
    const parent = await mkPage("About", "about");
    const child = await mkPage("Consulting", "consulting", { parentId: parent.id });
    const grandchild = await mkPage("Retainers", "retainers", { parentId: child.id });
    await mkPage("Secret", "secret", { parentId: parent.id, status: "draft" });
    expect(grandchild.path).toBe("/about/consulting/retainers");

    await h.call(ADMIN, "post.update", { id: parent.id, slug: "company" });
    const byFrom = Object.fromEntries(
      unwrap<any[]>(await h.call(ADMIN, "redirect.list")).map((r: any) => [r.fromPath, r.toPath]),
    );
    expect(byFrom["/about"]).toBe("/company");
    expect(byFrom["/about/consulting"]).toBe("/company/consulting");
    expect(byFrom["/about/consulting/retainers"]).toBe("/company/consulting/retainers");
    expect(byFrom["/about/secret"]).toBeUndefined();
  });

  test("re-parenting a page redirects its old full path", async () => {
    registerRedirectListener(h.hooks, h.db);
    const a = await mkPage("Alpha", "alpha");
    const b = await mkPage("Beta", "beta");
    const moved = await mkPage("Gamma", "gamma", { parentId: a.id });
    expect(moved.path).toBe("/alpha/gamma");

    const after = unwrap(await h.call(ADMIN, "post.update", { id: moved.id, parentId: b.id }));
    expect(after.path).toBe("/beta/gamma");
    const byFrom = Object.fromEntries(
      unwrap<any[]>(await h.call(ADMIN, "redirect.list")).map((r: any) => [r.fromPath, r.toPath]),
    );
    expect(byFrom["/alpha/gamma"]).toBe("/beta/gamma");
  });
});
