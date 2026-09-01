import { describe, expect, test, mock } from "bun:test";
import { createClient } from "@agentpress/sdk";
import { channelFetch } from "./api";

describe("channelFetch", () => {
  test("adds x-ap-channel: ui header while preserving other headers", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;

    try {
      await channelFetch("http://localhost:4000/api/tools/site.info", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(calls).toHaveLength(1);
    const headers = new Headers(calls[0].init?.headers);
    expect(headers.get("x-ap-channel")).toBe("ui");
    expect(headers.get("content-type")).toBe("application/json");
  });
});

describe("sdk client wired through channelFetch", () => {
  test("call() sends credentials:include and the ui channel header", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const fakeFetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      return new Response(JSON.stringify({ settings: {}, counts: { posts: 0, pages: 0, media: 0 }, version: "0.0.0" }), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    const client = createClient({ baseUrl: "http://localhost:4000", fetch: channelFetch });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fakeFetch;
    try {
      await client.call("site.info", {});
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(calls).toHaveLength(1);
    expect(calls[0].init?.credentials).toBe("include");
    const headers = new Headers(calls[0].init?.headers);
    expect(headers.get("x-ap-channel")).toBe("ui");
    expect(String(calls[0].input)).toBe("http://localhost:4000/api/tools/site.info");
  });
});

describe("fetchToolCatalog", () => {
  test("unwraps core's { tools: [...] } envelope", async () => {
    const { fetchToolCatalog } = await import("./api");
    const orig = globalThis.fetch;
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ tools: [{ name: "post.list", description: "d", inputSchema: {}, scopes: ["content:read"] }] }), {
        status: 200, headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;
    try {
      const tools = await fetchToolCatalog();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe("post.list");
    } finally { globalThis.fetch = orig; }
  });
});
