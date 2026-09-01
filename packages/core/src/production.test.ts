import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp, ADMIN_CSP } from "./http";
import { clearedCookie, sessionCookie } from "./auth";
import { corsOrigins, secureCookies, mode } from "./env";
import { isReservedPath } from "./proxy";
import { makeHarness } from "./test-helpers";

const h = makeHarness();
const app = (env: Record<string, string | undefined>) =>
  createApp({ db: h.db, hooks: h.hooks, registry: h.registry, env });

const get = (a: ReturnType<typeof app>, path: string, init?: RequestInit) =>
  a.fetch(new Request(`http://core.test${path}`, init));

// ------------------------------------------------------------------ admin dist fixture
const dist = mkdtempSync(join(tmpdir(), "wove-dist-"));
mkdirSync(join(dist, "assets"), { recursive: true });
writeFileSync(join(dist, "index.html"), "<!doctype html><title>Wove admin</title><div id=root></div>");
writeFileSync(join(dist, "assets", "x.js"), "export const x = 1;\n");
writeFileSync(join(dist, "favicon.svg"), "<svg/>");

afterAll(() => {
  rmSync(dist, { recursive: true, force: true });
  h.cleanup();
});

const prodEnv = { WOVE_ENV: "production", WOVE_ADMIN_DIST: dist };

describe("admin static serving", () => {
  const prod = app(prodEnv);

  test("serves index.html at /admin and /admin/", async () => {
    for (const path of ["/admin", "/admin/"]) {
      const res = await get(prod, path);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
      expect(await res.text()).toContain("Wove admin");
      expect(res.headers.get("cache-control")).toContain("no-cache");
    }
  });

  test("hashed assets are served immutable", async () => {
    const res = await get(prod, "/admin/assets/x.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(await res.text()).toContain("export const x");
  });

  test("a missing asset 404s rather than falling back to HTML", async () => {
    const res = await get(prod, "/admin/assets/gone-abc123.js");
    expect(res.status).toBe(404);
  });

  test("unknown routes fall back to index.html so deep links work", async () => {
    const res = await get(prod, "/admin/posts/abc/edit");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Wove admin");
  });

  test("non-hashed real files are served from disk", async () => {
    expect((await get(prod, "/admin/favicon.svg")).status).toBe(200);
  });

  test("path traversal cannot escape the dist directory", async () => {
    const res = await get(prod, "/admin/..%2f..%2fetc%2fpasswd");
    expect(res.status).toBe(404);
  });

  test("a missing dist directory 404s instead of crashing", async () => {
    const broken = app({ WOVE_ENV: "production", WOVE_ADMIN_DIST: join(dist, "nope") });
    expect((await get(broken, "/admin/")).status).toBe(404);
  });

  test("admin is not served at all in dev mode", async () => {
    const dev = app({ WOVE_ADMIN_DIST: dist });
    expect((await get(dev, "/admin/")).status).toBe(404);
  });

  test("the admin CSP is applied only to /admin, and framing/nosniff to everything", async () => {
    const admin = await get(prod, "/admin/");
    expect(admin.headers.get("content-security-policy")).toBe(ADMIN_CSP);
    expect(admin.headers.get("x-content-type-options")).toBe("nosniff");
    expect(admin.headers.get("x-frame-options")).toBe("SAMEORIGIN");

    const health = await get(prod, "/health");
    expect(health.headers.get("content-security-policy")).toBeNull();
    expect(health.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });

  test("the built admin entry is an external module script, so script-src 'self' suffices", () => {
    expect(ADMIN_CSP).toContain("script-src 'self'");
    expect(ADMIN_CSP).not.toContain("script-src 'self' 'unsafe-inline'");
  });
});

// ------------------------------------------------------------------ reverse proxy
describe("reverse proxy", () => {
  const seen: Array<{ method: string; path: string; headers: Record<string, string>; body: string }> = [];
  const upstream = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/redirect-me") {
        return new Response(null, { status: 302, headers: { location: "/elsewhere" } });
      }
      seen.push({
        method: req.method,
        path: url.pathname + url.search,
        headers: Object.fromEntries(req.headers),
        body: await req.text(),
      });
      return new Response(`echo:${url.pathname}`, { headers: { "content-type": "text/plain", "x-upstream": "1" } });
    },
  });
  const origin = `http://127.0.0.1:${upstream.port}`;
  const proxied = app({ WOVE_SITE_UPSTREAM: origin });

  afterAll(() => upstream.stop(true));

  test("forwards method, path, query, headers and body, and streams the response back", async () => {
    const res = await get(proxied, "/blog/hello?page=2", {
      method: "POST",
      headers: { "content-type": "application/json", "x-custom": "keep-me" },
      body: JSON.stringify({ hi: true }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-upstream")).toBe("1");
    expect(await res.text()).toBe("echo:/blog/hello");

    const hit = seen.at(-1)!;
    expect(hit.method).toBe("POST");
    expect(hit.path).toBe("/blog/hello?page=2");
    expect(hit.headers["x-custom"]).toBe("keep-me");
    expect(hit.body).toBe('{"hi":true}');
  });

  test("sets the x-forwarded trio", async () => {
    await get(proxied, "/about");
    const hit = seen.at(-1)!;
    expect(hit.headers["x-forwarded-host"]).toBe("core.test");
    expect(hit.headers["x-forwarded-proto"]).toBe("http");
    expect(hit.headers["x-forwarded-for"]).toBeTruthy();
  });

  test("redirects pass through untouched", async () => {
    const res = await get(proxied, "/redirect-me");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/elsewhere");
  });

  test("core keeps its own routes; only the rest is proxied", async () => {
    expect((await get(proxied, "/health")).headers.get("content-type")).toContain("application/json");
    expect((await get(proxied, "/api/tools")).status).toBe(200);
    // an unknown /api path is core's 404, never the site's
    const missing = await get(proxied, "/api/nope");
    expect(missing.status).toBe(404);
    expect((await missing.json()).code).toBe("not_found");
  });

  test("reserved prefixes are exactly the ones core owns", () => {
    for (const p of ["/api/tools", "/mcp", "/media/a.png", "/admin", "/admin/x", "/health"]) {
      expect(isReservedPath(p)).toBe(true);
    }
    for (const p of ["/", "/blog", "/about/us", "/apidocs"]) expect(isReservedPath(p)).toBe(false);
  });

  test("a dead upstream is a 502 JSON, not a hang or a stack trace", async () => {
    const dead = app({ WOVE_SITE_UPSTREAM: "http://127.0.0.1:1" });
    const res = await get(dead, "/anything");
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("bad_gateway");
  });

  test("with no upstream, GET / describes the deployment", async () => {
    const res = await get(app({}), "/");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: "wove", admin: "/admin", api: "/api", mcp: "/mcp" });
  });
});

// ------------------------------------------------------------------ CORS
describe("CORS allowlist", () => {
  const origin = async (a: ReturnType<typeof app>, o: string) =>
    (await get(a, "/health", { headers: { origin: o } })).headers.get("access-control-allow-origin");

  test("dev origins work with no configuration", async () => {
    const a = app({});
    expect(await origin(a, "http://localhost:5173")).toBe("http://localhost:5173");
    expect(await origin(a, "http://localhost:4321")).toBe("http://localhost:4321");
    expect(await origin(a, "https://evil.example")).toBeNull();
  });

  test("WOVE_CORS_ORIGINS and WOVE_SITE_URL extend the allowlist", async () => {
    const env = { WOVE_CORS_ORIGINS: "https://a.example, https://b.example", WOVE_SITE_URL: "https://site.example/blog" };
    const a = app(env);
    expect(await origin(a, "https://a.example")).toBe("https://a.example");
    expect(await origin(a, "https://b.example")).toBe("https://b.example");
    expect(await origin(a, "https://site.example")).toBe("https://site.example");
    expect(await origin(a, "https://c.example")).toBeNull();
    expect(corsOrigins(env)).toContain("http://localhost:5173"); // dev defaults survive
  });

  test("a same-origin request carries no Origin and gets no CORS header", async () => {
    expect((await get(app({}), "/health")).headers.get("access-control-allow-origin")).toBeNull();
  });
});

// ------------------------------------------------------------------ cookies
describe("session cookie flags", () => {
  test("HttpOnly + SameSite=Lax always; Secure only when the deployment is https", () => {
    const dev = sessionCookie("abc", 60, {});
    expect(dev).toContain("HttpOnly");
    expect(dev).toContain("SameSite=Lax");
    expect(dev).not.toContain("Secure");

    expect(sessionCookie("abc", 60, { WOVE_SITE_URL: "https://site.example" })).toContain("; Secure");
    expect(sessionCookie("abc", 60, { WOVE_SECURE_COOKIES: "1" })).toContain("; Secure");
    expect(sessionCookie("abc", 60, { WOVE_SITE_URL: "http://site.example" })).not.toContain("Secure");
    expect(clearedCookie({ WOVE_SECURE_COOKIES: "1" })).toContain("; Secure");

    expect(secureCookies({ WOVE_SITE_URL: "HTTPS://Site.example" })).toBe(true);
  });

  test("login over an https deployment sets a Secure cookie", async () => {
    const secure = app({ WOVE_SITE_URL: "https://site.example" });
    const { createUser } = await import("./auth");
    await createUser(h.db, { email: "sec@example.com", name: "S", password: "password123", role: "editor" });
    const res = await secure.fetch(new Request("http://core.test/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "sec@example.com", password: "password123" }),
    }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("Secure");
  });
});

// ------------------------------------------------------------------ health
describe("/health", () => {
  test("reports mode and uptime", async () => {
    const body = await (await get(app({}), "/health")).json();
    expect(body.mode).toBe("development");
    expect(typeof body.uptime).toBe("number");
    expect(body.uptime).toBeGreaterThanOrEqual(0);

    const prod = await (await get(app(prodEnv), "/health")).json();
    expect(prod.mode).toBe("production");
    expect(mode({ NODE_ENV: "production" })).toBe("production");
  });
});
