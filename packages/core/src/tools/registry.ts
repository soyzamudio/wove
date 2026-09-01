import { z } from "zod";
import type { Actor, Channel, Scope } from "@wove/sdk";
import type { DB } from "../db";
import { auditLog } from "../db/schema";
import { newId, nowIso } from "../ids";
import type { Hooks } from "../hooks";
import { AI_RATE_LIMITED_TOOLS, actorKey, aiLimiter, anonToolLimiter, consume } from "../ratelimit";

export interface Ctx {
  actor: Actor;
  channel: Channel;
  db: DB;
  hooks: Hooks;
  /**
   * The registry this call came from, when it is not the process-wide one (tests, embedded
   * hosts). Tools that dispatch *other* tools must honour it, or they would resolve against
   * an empty registry.
   */
  registry?: Registry;
  /**
   * Client IP, when the transport could determine one. Used to key rate limits for
   * anonymous callers; absent in-process (tests, hooks) which are never limited by IP.
   */
  ip?: string;
}

export interface Tool<I extends z.ZodTypeAny = z.ZodTypeAny, O extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  input: I;
  output: O;
  scopes: readonly Scope[];
  /** Mutations are always audited; reads are audited only on failure (see AUDIT POLICY below). */
  mutation: boolean;
  handler: (ctx: Ctx, input: z.output<I>) => Promise<z.input<O>> | z.input<O>;
}

export function defineTool<I extends z.ZodTypeAny, O extends z.ZodTypeAny>(
  t: Omit<Tool<I, O>, "mutation"> & { mutation?: boolean },
): Tool<I, O> {
  return { mutation: t.mutation ?? true, ...t } as Tool<I, O>;
}

export type ErrorCode =
  | "validation_error" | "unauthenticated" | "forbidden" | "not_found"
  | "conflict" | "rate_limited" | "internal_error";

const STATUS: Record<ErrorCode, number> = {
  validation_error: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  internal_error: 500,
};

export class ToolError extends Error {
  constructor(public code: ErrorCode, message: string, public details?: unknown) {
    super(message);
    this.name = "ToolError";
  }
  get status() {
    return STATUS[this.code];
  }
}

export const notFound = (m = "Not found", d?: unknown) => new ToolError("not_found", m, d);
export const badRequest = (m: string, d?: unknown) => new ToolError("validation_error", m, d);
export const conflict = (m: string, d?: unknown) => new ToolError("conflict", m, d);
export const rateLimited = (m: string, retryAfter: number) => new ToolError("rate_limited", m, { retryAfter });

// ---------------------------------------------------------------- registry

export class Registry {
  #tools = new Map<string, Tool<any, any>>();
  #version = 0;

  register(tool: Tool<any, any>, opts: { overwrite?: boolean } = {}): void {
    if (this.#tools.has(tool.name) && !opts.overwrite) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.#tools.set(tool.name, tool);
    this.#version++;
  }

  /** Bumped on every `register`; derived artefacts (the OpenAPI document) cache against it. */
  get version(): number {
    return this.#version;
  }

  get(name: string): Tool<any, any> | undefined {
    return this.#tools.get(name);
  }
  has(name: string): boolean {
    return this.#tools.has(name);
  }
  list(): Tool<any, any>[] {
    return [...this.#tools.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
  get size(): number {
    return this.#tools.size;
  }
}

export const registry = new Registry();

// ---------------------------------------------------------------- scopes

/** Scopes granted to a human user by role. */
export const ROLE_SCOPES: Record<"admin" | "editor", Scope[]> = {
  admin: ["*"],
  editor: [
    "content:read", "content:write", "content:publish",
    "media:read", "media:write",
    "settings:read", "settings:write",
    "audit:read",
  ],
};

export function hasScopes(actor: Actor, required: readonly Scope[]): boolean {
  if (required.length === 0) return true;
  if (actor.scopes.includes("*")) return true;
  return required.every((s) => actor.scopes.includes(s));
}

// ---------------------------------------------------------------- dispatch

/**
 * AUDIT POLICY
 * Every mutating tool call is written to `audit_log` (ok or not), and every FAILURE of any
 * call — reads included — is written too. Successful reads are skipped: they are high-volume,
 * carry no state change, and would dominate the table. Flip `WOVE_AUDIT_READS=1` to
 * record them as well.
 */
const AUDIT_READS = process.env.WOVE_AUDIT_READS === "1";

function writeAudit(ctx: Ctx, tool: string, input: unknown, ok: boolean, error: string | null) {
  try {
    ctx.db.insert(auditLog).values({
      id: newId(),
      ts: nowIso(),
      actorKind: ctx.actor.kind,
      actorId: ctx.actor.id,
      channel: ctx.channel,
      tool,
      input: redact(input),
      ok,
      error,
    }).run();
  } catch {
    // auditing must never break the request
  }
}

const SECRET_KEYS = new Set(["password", "base64", "apiKey", "api_key", "keyHash"]);
function redact(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    out[k] = SECRET_KEYS.has(k) ? "[redacted]" : v;
  }
  return out;
}

/** Write an audit row for work that bypasses `dispatch` (e.g. the SSE streaming endpoint). */
export function auditCall(ctx: Ctx, tool: string, input: unknown, ok: boolean, error: string | null): void {
  writeAudit(ctx, tool, input, ok, error);
}

export interface DispatchResult {
  ok: true;
  data: unknown;
}
export interface DispatchFailure {
  ok: false;
  status: number;
  error: { code: ErrorCode; message: string; details?: unknown };
  /** Seconds, set only on `rate_limited` so the transport can emit `Retry-After`. */
  retryAfter?: number;
}

/**
 * Rate limits live in `dispatch`, not in the HTTP layer, so REST and MCP share one budget
 * — an agent cannot dodge the AI limit by switching transports. In-process calls (no
 * `ctx.ip`, e.g. tests and hooks) are only limited when the actor is identifiable.
 */
function rateLimitFor(ctx: Ctx, name: string): { retryAfter: number } | null {
  const ip = ctx.ip;
  if (AI_RATE_LIMITED_TOOLS.has(name)) {
    const ai = consume(aiLimiter, `ai:${actorKey(ctx.actor, ip ?? "unknown")}`);
    if (ai.limited) return { retryAfter: ai.retryAfter };
  }
  if (ctx.actor.kind === "anon" && ip) {
    const anon = consume(anonToolLimiter, `tool:${ip}`);
    if (anon.limited) return { retryAfter: anon.retryAfter };
  }
  return null;
}

export async function dispatch(
  name: string,
  rawInput: unknown,
  ctx: Ctx,
  reg: Registry = registry,
): Promise<DispatchResult | DispatchFailure> {
  const tool = reg.get(name);
  if (!tool) {
    const err = new ToolError("not_found", `Unknown tool "${name}"`);
    writeAudit(ctx, name, rawInput, false, err.message);
    return fail(err);
  }

  const audit = (ok: boolean, error: string | null, input: unknown) => {
    if (tool.mutation || !ok || AUDIT_READS) writeAudit(ctx, name, input, ok, error);
  };

  // 0. rate limit (before validation, so a flood of malformed input costs nothing)
  const limited = rateLimitFor(ctx, name);
  if (limited) {
    const err = rateLimited(`Rate limit exceeded for "${name}"`, limited.retryAfter);
    audit(false, err.message, rawInput);
    return { ...fail(err), retryAfter: limited.retryAfter };
  }

  // 1. validate input
  const parsed = tool.input.safeParse(rawInput ?? {});
  if (!parsed.success) {
    const err = new ToolError("validation_error", "Input validation failed", parsed.error.flatten());
    audit(false, err.message, rawInput);
    return fail(err);
  }
  const input = parsed.data;

  // 2. authn / authz
  if (tool.scopes.length > 0 && ctx.actor.kind === "anon") {
    const err = new ToolError("unauthenticated", "Authentication required");
    audit(false, err.message, input);
    return fail(err);
  }
  if (!hasScopes(ctx.actor, tool.scopes)) {
    const err = new ToolError("forbidden", `Missing scope(s): ${tool.scopes.join(", ")}`, {
      required: tool.scopes,
      granted: ctx.actor.scopes,
    });
    audit(false, err.message, input);
    return fail(err);
  }

  // 3. run
  let result: unknown;
  try {
    result = await tool.handler(ctx, input);
  } catch (e) {
    const err = e instanceof ToolError ? e : new ToolError("internal_error", (e as Error)?.message ?? "Unhandled error");
    audit(false, err.message, input);
    return fail(err);
  }

  // 4. validate output
  const out = tool.output.safeParse(result);
  if (!out.success) {
    const err = new ToolError("internal_error", "Output validation failed", out.error.flatten());
    audit(false, err.message, input);
    return fail(err);
  }

  audit(true, null, input);
  return { ok: true, data: out.data };
}

function fail(err: ToolError): DispatchFailure {
  return { ok: false, status: err.status, error: { code: err.code, message: err.message, details: err.details } };
}
