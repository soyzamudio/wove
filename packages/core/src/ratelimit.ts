/**
 * In-memory sliding-window rate limiting.
 *
 * Deliberately per-process: wove's unit of deployment is one core process in front of one
 * SQLite file, so a shared store would add a dependency without buying anything. If core
 * ever runs multi-replica this is the one module to swap for Redis.
 *
 * Buckets are keyed by actor id when the caller is authenticated and by client IP when it
 * is not, so one noisy anonymous client cannot spend a signed-in editor's budget.
 */
import type { Actor } from "@wove/sdk";
import { aiRateLimit, rateLimitEnabled, trustProxy, type Env } from "./env";

export const WINDOW_MS = 60_000;

export interface RateLimitVerdict {
  ok: boolean;
  /** Seconds the caller should wait before retrying (0 when allowed). */
  retryAfter: number;
  limit: number;
  remaining: number;
}

/**
 * A fixed-capacity sliding window. Timestamps older than the window are dropped on read,
 * so an idle key costs nothing beyond its (eventually swept) map entry.
 */
export class SlidingWindow {
  #hits = new Map<string, number[]>();
  #lastSweep = 0;

  constructor(
    /** Read lazily so tests (and env reloads) can change the limit between calls. */
    public limitOf: () => number,
    public windowMs: number = WINDOW_MS,
  ) {}

  check(key: string, now = Date.now()): RateLimitVerdict {
    const limit = this.limitOf();
    if (limit <= 0) return { ok: true, retryAfter: 0, limit, remaining: Infinity };
    this.#sweep(now);
    const cutoff = now - this.windowMs;
    const hits = (this.#hits.get(key) ?? []).filter((t) => t > cutoff);
    if (hits.length >= limit) {
      this.#hits.set(key, hits);
      const retryAfter = Math.max(1, Math.ceil((hits[0]! + this.windowMs - now) / 1000));
      return { ok: false, retryAfter, limit, remaining: 0 };
    }
    hits.push(now);
    this.#hits.set(key, hits);
    return { ok: true, retryAfter: 0, limit, remaining: limit - hits.length };
  }

  reset(): void {
    this.#hits.clear();
    this.#lastSweep = 0;
  }

  get size(): number {
    return this.#hits.size;
  }

  /** Drop fully-expired keys at most once per window so the map cannot grow unbounded. */
  #sweep(now: number): void {
    if (now - this.#lastSweep < this.windowMs) return;
    this.#lastSweep = now;
    const cutoff = now - this.windowMs;
    for (const [k, v] of this.#hits) {
      if (v.length === 0 || v[v.length - 1]! <= cutoff) this.#hits.delete(k);
    }
  }
}

/** 10 sign-in or first-run-setup attempts per minute per IP. */
export const authLimiter = new SlidingWindow(() => 10);
/** `WOVE_AI_RATE_LIMIT` model calls per minute per actor (default 30). */
export const aiLimiter = new SlidingWindow(() => aiRateLimit());
/** 60 anonymous tool calls per minute per IP. */
export const anonToolLimiter = new SlidingWindow(() => 60);

const ALL = [authLimiter, aiLimiter, anonToolLimiter];

/** Test hook: forget every recorded hit. */
export function resetRateLimits(): void {
  for (const l of ALL) l.reset();
}

/** Tool names metered against `aiLimiter`. `ai.config`/`ai.models`/`ai.usage` are free — they call no model. */
export const AI_RATE_LIMITED_TOOLS = new Set([
  "ai.generate",
  "ai.rewrite",
  "ai.draftPost",
  "ai.generatePage",
  "ai.generateBlock",
  "ai.editBlock",
  "ai.test",
]);

/**
 * Client IP for rate-limit keying. Only the *first* hop of `x-forwarded-for` is used, and
 * only when `WOVE_TRUST_PROXY=1` — otherwise any client could mint unlimited buckets by
 * forging the header. Falls back to the socket address exposed by Bun's server, then to a
 * constant (single shared bucket) when neither is available.
 */
export function clientIp(req: Request, server?: unknown, env: Env = process.env): string {
  if (trustProxy(env)) {
    const fwd = req.headers.get("x-forwarded-for");
    const first = fwd?.split(",")[0]?.trim();
    if (first) return first;
  }
  const requestIP = (server as { requestIP?: (r: Request) => { address?: string } | null } | undefined)?.requestIP;
  if (typeof requestIP === "function") {
    try {
      const addr = requestIP.call(server, req)?.address;
      if (addr) return addr;
    } catch {
      /* not a Bun server (tests call app.fetch directly) */
    }
  }
  return "unknown";
}

/** Bucket key for an actor-scoped limit: the actor's id, or the IP when anonymous. */
export function actorKey(actor: Actor, ip: string): string {
  return actor.kind === "anon" || !actor.id ? `ip:${ip}` : `${actor.kind}:${actor.id}`;
}

export interface LimitCheck {
  limited: boolean;
  retryAfter: number;
}

/** Apply a limiter unless `WOVE_RATE_LIMIT=0`. */
export function consume(limiter: SlidingWindow, key: string, env: Env = process.env): LimitCheck {
  if (!rateLimitEnabled(env)) return { limited: false, retryAfter: 0 };
  const v = limiter.check(key);
  return { limited: !v.ok, retryAfter: v.retryAfter };
}

export const RATE_LIMITED_MESSAGE = "Too many requests — slow down and try again shortly.";
