import { createClient, AgentpressError, type ImportJob, type ImportOptions, type ToolInput, type ToolName, type ToolOutput, type User, type Actor } from "@agentpress/sdk";
import { useMutation, useQuery, useQueryClient, type UseMutationOptions, type UseQueryOptions } from "@tanstack/react-query";

export const API_URL: string = (import.meta as any).env?.VITE_API_URL ?? "http://localhost:4000";

/** Wraps global fetch to always send the `x-ap-channel: ui` header (per architecture: every
 * client of the tool API identifies its channel). Cookies are included by the sdk client itself. */
export function channelFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("x-ap-channel", "ui");
  return fetch(input, { ...init, headers });
}

export const client = createClient({ baseUrl: API_URL, fetch: channelFetch });

export { AgentpressError };

// ---------------------------------------------------------------------------
// Auth (plain REST — not part of the sdk ToolCatalog)
// ---------------------------------------------------------------------------

export interface MeResponse {
  user: User;
  actor: Actor;
}

async function authFetch<T>(path: string, body?: unknown): Promise<T> {
  const res = await channelFetch(`${API_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    throw new AgentpressError(res.status, data.code ?? "error", data.message ?? res.statusText, data.details);
  }
  return data as T;
}

export function apiSetup(input: { email: string; name: string; password: string }): Promise<MeResponse> {
  return authFetch("/api/auth/setup", input);
}

export function apiLogin(input: { email: string; password: string }): Promise<MeResponse> {
  return authFetch("/api/auth/login", input);
}

export function apiLogout(): Promise<{ ok: true }> {
  return authFetch("/api/auth/logout");
}

export async function apiMe(): Promise<MeResponse | null> {
  const res = await channelFetch(`${API_URL}/api/auth/me`, { method: "GET", credentials: "include" });
  if (res.status === 401) return null;
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as any;
    throw new AgentpressError(res.status, data.code ?? "error", data.message ?? res.statusText, data.details);
  }
  return (await res.json()) as MeResponse;
}

// ---------------------------------------------------------------------------
// GET /api/tools — read-only catalog for the /tools reference page
// ---------------------------------------------------------------------------

export interface ToolCatalogEntry {
  name: string;
  description: string;
  inputSchema: unknown;
  scopes: string[];
}

export async function fetchToolCatalog(): Promise<ToolCatalogEntry[]> {
  const res = await channelFetch(`${API_URL}/api/tools`, { method: "GET", credentials: "include" });
  if (!res.ok) throw new AgentpressError(res.status, "error", res.statusText);
  // core wraps the list: { tools: [...] }
  const body = (await res.json()) as { tools: ToolCatalogEntry[] };
  return body.tools;
}

// ---------------------------------------------------------------------------
// POST /api/import/wordpress — multipart upload, outside the sdk ToolCatalog
// since it takes a file rather than a JSON body.
// ---------------------------------------------------------------------------

export async function importWordpress(file: File, options: ImportOptions): Promise<ImportJob> {
  const form = new FormData();
  form.append("file", file);
  form.append("options", JSON.stringify(options));
  const res = await channelFetch(`${API_URL}/api/import/wordpress`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    throw new AgentpressError(res.status, data.code ?? "error", data.message ?? res.statusText, data.details);
  }
  return data as ImportJob;
}

/** URL for `GET /api/export/site.json` — trigger with window.open/<a href>, not fetch, so the session cookie rides along and the browser saves the download. */
export function exportSiteUrl(): string {
  return `${API_URL}/api/export/site.json`;
}

// ---------------------------------------------------------------------------
// Generic react-query hooks over client.call
// ---------------------------------------------------------------------------

export function toolQueryKey<N extends ToolName>(name: N, input?: ToolInput<N>): unknown[] {
  return [name, input ?? {}];
}

export function useToolQuery<N extends ToolName>(
  name: N,
  input: ToolInput<N>,
  options?: Omit<UseQueryOptions<ToolOutput<N>, AgentpressError>, "queryKey" | "queryFn">
) {
  return useQuery<ToolOutput<N>, AgentpressError>({
    queryKey: toolQueryKey(name, input),
    queryFn: () => client.call(name, input),
    ...options,
  });
}

export function useToolMutation<N extends ToolName>(
  name: N,
  options?: Omit<UseMutationOptions<ToolOutput<N>, AgentpressError, ToolInput<N>>, "mutationFn">
) {
  return useMutation<ToolOutput<N>, AgentpressError, ToolInput<N>>({
    mutationFn: (input: ToolInput<N>) => client.call(name, input),
    ...options,
  });
}

export function useInvalidateTool() {
  const qc = useQueryClient();
  return (name: ToolName) => qc.invalidateQueries({ queryKey: [name] });
}

// ---------------------------------------------------------------------------
// AI streaming — POST /api/ai/stream (text/event-stream), outside the sdk
// ToolCatalog since it streams rather than returning a single JSON result.
// ---------------------------------------------------------------------------

export type AiStreamBody =
  | { kind: "generate"; prompt: string; postId?: string; maxTokens?: number }
  | { kind: "rewrite"; text: string; instruction: string };

export interface AiStreamDone {
  usage: { inputTokens: number; outputTokens: number };
  model: string;
}

export interface AiStreamErrorInfo {
  code: string;
  message: string;
}

export interface AiStreamHandlers {
  onToken?: (text: string) => void;
  onDone?: (info: AiStreamDone) => void;
  onError?: (info: AiStreamErrorInfo) => void;
  signal?: AbortSignal;
}

interface SseEvent {
  event: string;
  data: string;
}

/**
 * Pure SSE parser: given the bytes accumulated so far, returns every complete
 * `\n\n`-terminated event and the leftover (incomplete) tail to keep buffering.
 * Handles multi-line `data:` fields (joined with `\n`, per the SSE spec) and a
 * missing `event:` line (defaults to "message").
 */
export function parseSseBuffer(buffer: string): { events: SseEvent[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n\n");
  const rest = parts.pop() ?? "";
  const events: SseEvent[] = [];
  for (const part of parts) {
    if (!part.trim()) continue;
    let event = "message";
    const dataLines: string[] = [];
    for (const line of part.split("\n")) {
      if (line.startsWith("event:")) {
        event = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).replace(/^ /, ""));
      }
    }
    events.push({ event, data: dataLines.join("\n") });
  }
  return { events, rest };
}

/**
 * Streams `POST /api/ai/stream`. Emits tokens via onToken as they arrive,
 * calls onDone once with final usage/model, or onError on failure. Pass an
 * AbortController's signal to allow the caller to stop the stream.
 */
export async function streamAi(body: AiStreamBody, handlers: AiStreamHandlers = {}): Promise<void> {
  const { onToken, onDone, onError, signal } = handlers;
  let res: Response;
  try {
    res = await channelFetch(`${API_URL}/api/ai/stream`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err: any) {
    if (err?.name === "AbortError") return;
    onError?.({ code: "network_error", message: err?.message ?? String(err) });
    return;
  }

  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    onError?.({ code: data.code ?? "error", message: data.message ?? res.statusText });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { events, rest } = parseSseBuffer(buffer);
      buffer = rest;
      for (const evt of events) {
        if (!evt.data) continue;
        let data: any;
        try {
          data = JSON.parse(evt.data);
        } catch {
          continue;
        }
        if (evt.event === "token") onToken?.(data.text ?? "");
        else if (evt.event === "done") onDone?.(data as AiStreamDone);
        else if (evt.event === "error") onError?.(data as AiStreamErrorInfo);
      }
    }
  } catch (err: any) {
    if (err?.name === "AbortError") return;
    onError?.({ code: "network_error", message: err?.message ?? String(err) });
  }
}
