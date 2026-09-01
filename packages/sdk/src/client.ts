import type { ToolName, ToolInput, ToolOutput } from "./tools";

export interface ClientOptions {
  baseUrl: string;                 // e.g. http://localhost:4000
  apiKey?: string;                 // agent key; omit for cookie/session (browser)
  fetch?: typeof fetch;
}

export class AgentpressError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

/** Typed client over `POST /api/tools/:name`. Works in browser (cookies) and server (apiKey). */
export function createClient(opts: ClientOptions) {
  const f = opts.fetch ?? fetch;
  const base = opts.baseUrl.replace(/\/$/, "");
  async function call<N extends ToolName>(name: N, input: ToolInput<N>): Promise<ToolOutput<N>> {
    const res = await f(`${base}/api/tools/${name}`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}) },
      body: JSON.stringify(input ?? {}),
    });
    const body = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) throw new AgentpressError(res.status, body.code ?? "error", body.message ?? res.statusText, body.details);
    return body as ToolOutput<N>;
  }
  return { call, baseUrl: base };
}
export type Client = ReturnType<typeof createClient>;
