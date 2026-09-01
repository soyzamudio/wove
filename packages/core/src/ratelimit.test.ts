import { describe, expect, test, beforeEach } from "bun:test";
import { SlidingWindow, consume, actorKey, clientIp, resetRateLimits, authLimiter } from "./ratelimit";
import { ANON, makeHarness } from "./test-helpers";
import { createApp } from "./http";

describe("SlidingWindow", () => {
  test("allows up to the limit, then reports a retry-after inside the window", () => {
    const w = new SlidingWindow(() => 3, 60_000);
    const t0 = 1_000_000;
    expect(w.check("k", t0).ok).toBe(true);
    expect(w.check("k", t0 + 10).ok).toBe(true);
    const third = w.check("k", t0 + 20);
    expect(third.ok).toBe(true);
    expect(third.remaining).toBe(0);

    const blocked = w.check("k", t0 + 30);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBe(60); // ~the full window is still ahead
    expect(blocked.limit).toBe(3);
  });

  test("the window slides: hits expire and the budget comes back", () => {
    const w = new SlidingWindow(() => 2, 1_000);
    const t0 = 5_000_000;
    w.check("k", t0);
    w.check("k", t0 + 100);
    expect(w.check("k", t0 + 200).ok).toBe(false);
    expect(w.check("k", t0 + 1_101).ok).toBe(true); // both earlier hits are outside now
  });

  test("keys are independent and reset() clears everything", () => {
    const w = new SlidingWindow(() => 1);
    expect(w.check("a").ok).toBe(true);
    expect(w.check("b").ok).toBe(true);
    expect(w.check("a").ok).toBe(false);
    w.reset();
    expect(w.check("a").ok).toBe(true);
  });

  test("WOVE_RATE_LIMIT=0 bypasses the limiter entirely", () => {
    const w = new SlidingWindow(() => 1);
    const off = { WOVE_RATE_LIMIT: "0" };
    for (let i = 0; i < 50; i++) expect(consume(w, "k", off).limited).toBe(false);
    expect(consume(w, "k", {}).limited).toBe(false); // nothing was recorded while bypassed
  });
});

describe("rate-limit keys", () => {
  test("actors key on their id, anonymous callers on their IP", () => {
    expect(actorKey({ kind: "user", id: "u1", scopes: [] }, "1.2.3.4")).toBe("user:u1");
    expect(actorKey(ANON, "1.2.3.4")).toBe("ip:1.2.3.4");
  });

  test("x-forwarded-for is honoured only with WOVE_TRUST_PROXY=1, and only the first hop", () => {
    const req = new Request("http://x/", { headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" } });
    expect(clientIp(req, undefined, {})).toBe("unknown");
    expect(clientIp(req, undefined, { WOVE_TRUST_PROXY: "1" })).toBe("9.9.9.9");
  });
});

describe("HTTP rate limits", () => {
  const h = makeHarness();
  const app = createApp({ db: h.db, hooks: h.hooks, registry: h.registry, env: { WOVE_TRUST_PROXY: "1" } });
  const from = (ip: string, path: string, body: unknown) =>
    app.fetch(new Request(`http://localhost:4000${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    }));

  beforeEach(() => resetRateLimits());

  test("login is capped at 10/min/IP with a Retry-After header", async () => {
    for (let i = 0; i < 10; i++) {
      const res = await from("5.5.5.5", "/api/auth/login", { email: "nobody@example.com", password: "nope123456" });
      expect(res.status).toBe(401);
    }
    const limited = await from("5.5.5.5", "/api/auth/login", { email: "nobody@example.com", password: "nope123456" });
    expect(limited.status).toBe(429);
    expect((await limited.json()).code).toBe("rate_limited");
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);

    // a different IP still has its own budget
    expect((await from("6.6.6.6", "/api/auth/login", { email: "n@example.com", password: "nope123456" })).status).toBe(401);
  });

  test("setup shares the auth budget", async () => {
    for (let i = 0; i < 10; i++) await from("7.7.7.7", "/api/auth/setup", {});
    expect((await from("7.7.7.7", "/api/auth/setup", {})).status).toBe(429);
  });

  test("anonymous tool calls are capped at 60/min/IP inside dispatch", async () => {
    for (let i = 0; i < 60; i++) {
      expect((await from("8.8.8.8", "/api/tools/post.list", {})).status).toBe(401); // anon, but counted
    }
    const limited = await from("8.8.8.8", "/api/tools/post.list", {});
    expect(limited.status).toBe(429);
    expect((await limited.json()).code).toBe("rate_limited");
    expect(limited.headers.get("retry-after")).toBeTruthy();
  });

  test("authLimiter is the shared process-wide bucket", () => {
    resetRateLimits();
    expect(authLimiter.size).toBe(0);
  });
});
