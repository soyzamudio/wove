import { describe, expect, test, mock } from "bun:test";
import { createClient } from "@wove/sdk";
import { channelFetch, parseSseBuffer, resolveApiOrigin, resolveApiUrl, streamAi, streamChat } from "./api";

describe("resolveApiOrigin", () => {
  test("uses the absolute API_URL when set", () => {
    expect(resolveApiOrigin("http://localhost:4000", "http://localhost:5173")).toBe("http://localhost:4000");
  });

  test("falls back to the page origin when API_URL is same-origin (empty)", () => {
    expect(resolveApiOrigin("", "https://blog.example.com")).toBe("https://blog.example.com");
  });

  test("falls back to the dev core address when neither is available", () => {
    expect(resolveApiOrigin("", undefined)).toBe("http://localhost:4000");
  });
});

describe("resolveApiUrl", () => {
  test("VITE_API_URL always wins, in dev or prod", () => {
    expect(resolveApiUrl({ VITE_API_URL: "https://api.example.com" })).toBe("https://api.example.com");
    expect(resolveApiUrl({ VITE_API_URL: "https://api.example.com", PROD: true })).toBe("https://api.example.com");
  });

  test("defaults to same-origin (empty prefix) in a production build with no override", () => {
    expect(resolveApiUrl({ PROD: true })).toBe("");
  });

  test("defaults to the local core dev server outside production", () => {
    expect(resolveApiUrl({})).toBe("http://localhost:4000");
    expect(resolveApiUrl({ PROD: false })).toBe("http://localhost:4000");
  });
});

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

describe("streamChat", () => {
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

  const readCall = {
    id: "c1",
    tool: "post.list",
    input: { type: "page" },
    kind: "read",
    status: "executed",
    result: { items: [] },
    preview: null,
  };
  const proposedCall = {
    id: "c2",
    tool: "post.create",
    input: { title: "Pricing" },
    kind: "mutation",
    status: "proposed",
    result: null,
    preview: { title: "Create page \u201cPricing\u201d", diff: "@@ -0,0 +1 @@\n+Pricing" },
  };
  const finalMessage = {
    id: "m1",
    role: "assistant",
    content: "Here is the plan.",
    toolCalls: [readCall, proposedCall],
    planPending: true,
    usage: null,
    ts: "2026-01-01T00:00:00.000Z",
  };

  test("routes every event kind to its handler, in order", async () => {
    const body =
      'event: thread\ndata: {"threadId":"t1","title":"Pricing page"}\n\n' +
      'event: token\ndata: {"text":"Here "}\n\n' +
      'event: token\ndata: {"text":"is"}\n\n' +
      `event: tool_call\ndata: ${JSON.stringify({ call: readCall })}\n\n` +
      `event: tool_call\ndata: ${JSON.stringify({ call: proposedCall })}\n\n` +
      `event: message\ndata: ${JSON.stringify({ message: finalMessage })}\n\n` +
      'event: done\ndata: {"usage":{"inputTokens":9,"outputTokens":3}}\n\n';

    const orig = globalThis.fetch;
    let sent: any = null;
    globalThis.fetch = mock(async (_input: any, init?: RequestInit) => {
      sent = init;
      return sseResponse(body);
    }) as unknown as typeof fetch;

    const seen: string[] = [];
    let thread: any = null;
    let tokens = "";
    const calls: any[] = [];
    let message: any = null;
    let done: any = null;
    try {
      await streamChat(
        { message: "make a pricing page" },
        {
          onThread: (t) => { seen.push("thread"); thread = t; },
          onToken: (t) => { seen.push("token"); tokens += t; },
          onToolCall: (c) => { seen.push("tool_call"); calls.push(c); },
          onMessage: (m) => { seen.push("message"); message = m; },
          onDone: (d) => { seen.push("done"); done = d; },
          onError: () => seen.push("error"),
        }
      );
    } finally {
      globalThis.fetch = orig;
    }

    expect(seen).toEqual(["thread", "token", "token", "tool_call", "tool_call", "message", "done"]);
    expect(thread).toEqual({ threadId: "t1", title: "Pricing page" });
    expect(tokens).toBe("Here is");
    expect(calls.map((c) => c.status)).toEqual(["executed", "proposed"]);
    expect(calls[1].preview.diff).toContain("+Pricing");
    expect(message.planPending).toBe(true);
    expect(message.toolCalls).toHaveLength(2);
    expect(done).toEqual({ usage: { inputTokens: 9, outputTokens: 3 } });

    expect(sent?.credentials).toBe("include");
    expect(new Headers(sent?.headers).get("x-wove-channel")).toBe("ui");
    expect(JSON.parse(String(sent?.body))).toEqual({ message: "make a pricing page" });
  });

  test("passes threadId through and handles an in-stream error event", async () => {
    const orig = globalThis.fetch;
    let sent: any = null;
    globalThis.fetch = mock(async (_input: any, init?: RequestInit) => {
      sent = init;
      return sseResponse('event: token\ndata: {"text":"partial"}\n\nevent: error\ndata: {"code":"provider_error","message":"upstream 529"}\n\n');
    }) as unknown as typeof fetch;

    let tokens = "";
    let error: any = null;
    try {
      await streamChat({ threadId: "t9", message: "hi" }, { onToken: (t) => (tokens += t), onError: (e) => (error = e) });
    } finally {
      globalThis.fetch = orig;
    }

    expect(tokens).toBe("partial");
    expect(error).toEqual({ code: "provider_error", message: "upstream 529" });
    expect(JSON.parse(String(sent?.body)).threadId).toBe("t9");
  });

  test("surfaces a non-2xx JSON setup failure through onError", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = mock(
      async () =>
        new Response(JSON.stringify({ code: "no_key", message: "No API key configured" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        })
    ) as unknown as typeof fetch;

    let error: any = null;
    let done = false;
    try {
      await streamChat({ message: "hi" }, { onError: (e) => (error = e), onDone: () => (done = true) });
    } finally {
      globalThis.fetch = orig;
    }

    expect(error).toEqual({ code: "no_key", message: "No API key configured" });
    expect(done).toBe(false);
  });

  test("ignores unknown events and malformed JSON payloads", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = mock(async () =>
      sseResponse(
        'event: heartbeat\ndata: {"t":1}\n\n' +
          'event: token\ndata: {not json\n\n' +
          'event: token\ndata: {"text":"ok"}\n\n'
      )
    ) as unknown as typeof fetch;

    let tokens = "";
    let error: any = null;
    try {
      await streamChat({ message: "hi" }, { onToken: (t) => (tokens += t), onError: (e) => (error = e) });
    } finally {
      globalThis.fetch = orig;
    }

    expect(tokens).toBe("ok");
    expect(error).toBeNull();
  });

  test("resolves quietly when the caller aborts", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      const err: any = new Error("aborted");
      err.name = "AbortError";
      throw err;
    }) as unknown as typeof fetch;

    let error: any = null;
    const controller = new AbortController();
    controller.abort();
    try {
      await streamChat({ message: "hi" }, { onError: (e) => (error = e) }, controller.signal);
    } finally {
      globalThis.fetch = orig;
    }
    expect(error).toBeNull();
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
