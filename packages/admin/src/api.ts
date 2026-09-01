import { createClient, AgentpressError, type ToolInput, type ToolName, type ToolOutput, type User, type Actor } from "@agentpress/sdk";
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
