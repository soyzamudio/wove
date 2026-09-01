import { describe, expect, test, mock } from "bun:test";
import { createClient } from "@wove/sdk";
import { channelFetch, parseSseBuffer, streamAi } from "./api";

describe("channelFetch", () => {
  test("adds x-wove-channel: ui header while preserving other headers", async () => {
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
    expect(headers.get("x-wove-channel")).toBe("ui");
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
    expect(headers.get("x-wove-channel")).toBe("ui");
    expect(String(calls[0].input)).toBe("http://localhost:4000/api/tools/site.info");
  });
});

describe("parseSseBuffer", () => {
  test("parses a single complete event", () => {
    const { events, rest } = parseSseBuffer('event: token\ndata: {"text":"hi"}\n\n');
    expect(events).toEqual([{ event: "token", data: '{"text":"hi"}' }]);
    expect(rest).toBe("");
  });

  test("buffers an incomplete trailing event across chunks", () => {
    const first = parseSseBuffer('event: token\ndata: {"text":"a"}\n\nevent: tok');
    expect(first.events).toEqual([{ event: "token", data: '{"text":"a"}' }]);
    expect(first.rest).toBe("event: tok");

    const second = parseSseBuffer(first.rest + 'en\ndata: {"text":"b"}\n\n');
    expect(second.events).toEqual([{ event: "token", data: '{"text":"b"}' }]);
    expect(second.rest).toBe("");
  });

  test("joins multi-line data fields with \\n per the SSE spec", () => {
    const { events } = parseSseBuffer("event: token\ndata: line one\ndata: line two\n\n");
    expect(events).toEqual([{ event: "token", data: "line one\nline two" }]);
  });

  test("defaults to event 'message' when no event: line is present", () => {
    const { events } = parseSseBuffer('data: {"ok":true}\n\n');
    expect(events).toEqual([{ event: "message", data: '{"ok":true}' }]);
  });

  test("parses done and error events", () => {
    const buf =
      'event: done\ndata: {"usage":{"inputTokens":1,"outputTokens":2},"model":"m"}\n\n' +
      'event: error\ndata: {"code":"bad","message":"nope"}\n\n';
    const { events, rest } = parseSseBuffer(buf);
    expect(events).toHaveLength(2);
    expect(events[0].event).toBe("done");
    expect(events[1].event).toBe("error");
    expect(rest).toBe("");
  });

  test("ignores blank keep-alive chunks", () => {
    const { events, rest } = parseSseBuffer("\n\nevent: token\ndata: x\n\n");
    expect(events).toEqual([{ event: "token", data: "x" }]);
    expect(rest).toBe("");
  });
});

describe("streamAi", () => {
  function sseResponse(text: string, status = 200) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        controller.close();
      },
    });
    return new Response(stream, { status, headers: { "content-type": "text/event-stream" } });
  }

  test("streams tokens and calls onDone with usage/model", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = mock(async () =>
      sseResponse(
        'event: token\ndata: {"text":"Hel"}\n\n' +
          'event: token\ndata: {"text":"lo"}\n\n' +
          'event: done\ndata: {"usage":{"inputTokens":5,"outputTokens":2},"model":"claude"}\n\n'
      )
    ) as unknown as typeof fetch;

    const tokens: string[] = [];
    let done: any = null;
    try {
      await streamAi({ kind: "generate", prompt: "hi" }, { onToken: (t) => tokens.push(t), onDone: (d) => (done = d) });
    } finally {
      globalThis.fetch = orig;
    }

    expect(tokens.join("")).toBe("Hello");
    expect(done).toEqual({ usage: { inputTokens: 5, outputTokens: 2 }, model: "claude" });
  });

  test("calls onError for a non-2xx JSON error response", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = mock(
      async () =>
        new Response(JSON.stringify({ code: "no_key", message: "No API key configured" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        })
    ) as unknown as typeof fetch;

    let error: any = null;
    try {
      await streamAi({ kind: "generate", prompt: "hi" }, { onError: (e) => (error = e) });
    } finally {
      globalThis.fetch = orig;
    }

    expect(error).toEqual({ code: "no_key", message: "No API key configured" });
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
