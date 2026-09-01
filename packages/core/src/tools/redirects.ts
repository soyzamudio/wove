/**
 * Redirects + the 404 log.
 *
 * Two surfaces live here:
 *  - the admin-facing tools (`redirect.*`, `notfound.*`), and
 *  - `publicRedirectRoutes(db)`, a Hono sub-app the HTTP layer mounts at `/api/public`,
 *    which the public site calls when it is about to render a 404.
 */
import { Hono } from "hono";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { Redirect, ToolCatalog, ToolDescriptions } from "@wove/sdk";
import type { DB } from "../db";
import { notFoundLog, redirects } from "../db/schema";
import { newId, nowIso } from "../ids";
import { badRequest, conflict, defineTool, notFound } from "./registry";
import { decodeCursor, encodeCursor } from "./shared";
import { SlidingWindow, clientIp, consume } from "../ratelimit";

const D = ToolDescriptions;

/** The 404 log is a diagnostic, not an archive: keep the busiest paths, drop the rest. */
export const NOT_FOUND_MAX_ROWS = 500;

/** Static assets a missing-file 404 produces; logging them buries the interesting paths. */
const ASSET_RE = /\.(ico|png|jpg|jpeg|svg|css|js|map|txt|xml|webp|woff2?)$/i;

/** Paths that are never "content" and so never worth reporting. */
export function shouldReport404(path: string): boolean {
  if (!path || !path.startsWith("/")) return false;
  const clean = path.split(/[?#]/)[0]!;
  if (ASSET_RE.test(clean)) return false;
  if (clean === "/api" || clean.startsWith("/api/")) return false;
  if (clean === "/admin" || clean.startsWith("/admin")) return false;
  if (clean.startsWith("/.well-known/")) return false;
  return true;
}

/**
 * Paths are compared verbatim except for a trailing slash, which browsers and editors add
 * inconsistently; `/old/` and `/old` are the same redirect.
 */
export function normalizePath(p: string): string {
  const trimmed = p.trim();
  if (trimmed.length > 1 && trimmed.endsWith("/")) return trimmed.replace(/\/+$/, "") || "/";
  return trimmed;
}

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** `fromPath` is always a site-relative path — never a URL, never blank. */
export function validateFromPath(raw: string): string {
  const p = normalizePath(raw);
  if (!p.startsWith("/")) throw badRequest(`fromPath must start with "/" (got "${raw}")`);
  if (p.startsWith("//") || HAS_SCHEME.test(p)) throw badRequest("fromPath must be a path, not a URL");
  if (/\s/.test(p)) throw badRequest("fromPath must not contain whitespace");
  return p;
}

/** `toPath` is a site-relative path or an absolute http(s) URL. */
export function validateToPath(raw: string): string {
  const p = raw.trim();
  if (!p) throw badRequest("toPath is required");
  if (/\s/.test(p)) throw badRequest("toPath must not contain whitespace");
  if (/^https?:\/\//i.test(p)) return p;
  if (HAS_SCHEME.test(p)) throw badRequest("toPath must be a path or an http(s) URL");
  if (!p.startsWith("/")) throw badRequest(`toPath must start with "/" or be an absolute http(s) URL (got "${raw}")`);
  return normalizePath(p);
}

function rowToRedirect(row: typeof redirects.$inferSelect): Redirect {
  return {
    id: row.id,
    fromPath: row.fromPath,
    toPath: row.toPath,
    code: (row.code === 302 ? 302 : 301) as 301 | 302,
    source: row.source,
    hits: row.hits,
    createdAt: row.createdAt,
  };
}

export function listRedirects(db: DB): Redirect[] {
  // `rowid` breaks ties: ids are random, and two redirects can share a millisecond.
  return db.select().from(redirects).orderBy(desc(redirects.createdAt), desc(sql`rowid`)).all().map(rowToRedirect);
}

/**
 * Reject the two loops that are cheap to detect: a redirect onto itself, and a two-hop
 * cycle (`/a → /b` when `/b → /a` already exists). Longer chains are left alone — the
 * resolver never follows a chain, so they cost a visitor one hop at most.
 */
export function assertNoLoop(db: DB, fromPath: string, toPath: string): void {
  if (fromPath === toPath) throw badRequest("A redirect cannot point at itself");
  if (!toPath.startsWith("/")) return;
  const hop = db.select().from(redirects).where(eq(redirects.fromPath, toPath)).get();
  if (hop && normalizePath(hop.toPath) === fromPath) {
    throw badRequest(`Redirect loop: "${toPath}" already redirects back to "${fromPath}"`);
  }
}

export interface CreateRedirectInput {
  fromPath: string;
  toPath: string;
  code?: 301 | 302;
  source?: Redirect["source"];
}

/** Shared by the tool and the slug-change listener. Throws ToolError on a bad/duplicate pair. */
export function createRedirect(db: DB, input: CreateRedirectInput): Redirect {
  const fromPath = validateFromPath(input.fromPath);
  const toPath = validateToPath(input.toPath);
  assertNoLoop(db, fromPath, toPath);
  const existing = db.select().from(redirects).where(eq(redirects.fromPath, fromPath)).get();
  if (existing) throw conflict(`A redirect for "${fromPath}" already exists`);
  const row = {
    id: newId(),
    fromPath,
    toPath,
    code: input.code ?? 301,
    source: input.source ?? ("manual" as const),
    hits: 0,
    createdAt: nowIso(),
  };
  db.insert(redirects).values(row).run();
  return rowToRedirect(row as typeof redirects.$inferSelect);
}

// ---------------------------------------------------------------- tools

export const redirectList = defineTool({
  name: "redirect.list",
  description: D["redirect.list"],
  input: ToolCatalog["redirect.list"].input,
  output: ToolCatalog["redirect.list"].output,
  scopes: ToolCatalog["redirect.list"].scopes,
  mutation: false,
  handler: (ctx) => listRedirects(ctx.db),
});

export const redirectCreate = defineTool({
  name: "redirect.create",
  description: D["redirect.create"],
  input: ToolCatalog["redirect.create"].input,
  output: ToolCatalog["redirect.create"].output,
  scopes: ToolCatalog["redirect.create"].scopes,
  handler: (ctx, input) => createRedirect(ctx.db, input),
});

export const redirectDelete = defineTool({
  name: "redirect.delete",
  description: D["redirect.delete"],
  input: ToolCatalog["redirect.delete"].input,
  output: ToolCatalog["redirect.delete"].output,
  scopes: ToolCatalog["redirect.delete"].scopes,
  handler: (ctx, input) => {
    const row = ctx.db.select().from(redirects).where(eq(redirects.id, input.id)).get();
    if (!row) throw notFound(`No redirect with id "${input.id}"`);
    ctx.db.delete(redirects).where(eq(redirects.id, input.id)).run();
    return { ok: true as const };
  },
});

export const notfoundList = defineTool({
  name: "notfound.list",
  description: D["notfound.list"],
  input: ToolCatalog["notfound.list"].input,
  output: ToolCatalog["notfound.list"].output,
  scopes: ToolCatalog["notfound.list"].scopes,
  mutation: false,
  handler: (ctx, input) => {
    const offset = decodeCursor(input.cursor);
    const rows = ctx.db
      .select()
      .from(notFoundLog)
      .orderBy(desc(notFoundLog.count), desc(notFoundLog.lastSeen))
      .limit(input.limit + 1)
      .offset(offset)
      .all();
    const items = rows.slice(0, input.limit).map((r) => ({
      path: r.path, count: r.count, lastSeen: r.lastSeen, referrer: r.referrer ?? null,
    }));
    return { items, nextCursor: rows.length > input.limit ? encodeCursor(offset + input.limit) : null };
  },
});

export const notfoundClear = defineTool({
  name: "notfound.clear",
  description: D["notfound.clear"],
  input: ToolCatalog["notfound.clear"].input,
  output: ToolCatalog["notfound.clear"].output,
  scopes: ToolCatalog["notfound.clear"].scopes,
  handler: (ctx, input) => {
    if (input.path) {
      const path = normalizePath(input.path);
      const hit = ctx.db.select({ path: notFoundLog.path }).from(notFoundLog).where(eq(notFoundLog.path, path)).get();
      if (!hit) return { ok: true as const, cleared: 0 };
      ctx.db.delete(notFoundLog).where(eq(notFoundLog.path, path)).run();
      return { ok: true as const, cleared: 1 };
    }
    const all = ctx.db.select({ path: notFoundLog.path }).from(notFoundLog).all();
    ctx.db.delete(notFoundLog).run();
    return { ok: true as const, cleared: all.length };
  },
});

export const redirectTools = [redirectList, redirectCreate, redirectDelete, notfoundList, notfoundClear];

// ---------------------------------------------------------------- public endpoints

/** 60 404 reports per minute per IP — enough for a crawler, useless as an amplifier. */
export const notFoundReportLimiter = new SlidingWindow(() => 60);

export interface ResolvedRedirect {
  toPath: string;
  code: 301 | 302;
}

/** Look up a redirect for `path`, counting the hit and retiring the 404 entry it fixes. */
export function resolveRedirect(db: DB, rawPath: string): ResolvedRedirect | null {
  const path = normalizePath(rawPath);
  if (!path.startsWith("/")) return null;
  const row = db.select().from(redirects).where(eq(redirects.fromPath, path)).get();
  if (!row) return null;
  db.update(redirects).set({ hits: row.hits + 1 }).where(eq(redirects.id, row.id)).run();
  // The path is answered now, so it is no longer an unhandled 404.
  db.delete(notFoundLog).where(eq(notFoundLog.path, path)).run();
  return { toPath: row.toPath, code: (row.code === 302 ? 302 : 301) as 301 | 302 };
}

/** Record one 404. First referrer wins — it is the one that shows where the bad link lives. */
export function record404(db: DB, rawPath: string, referrer?: string | null): void {
  const path = normalizePath(rawPath);
  if (!shouldReport404(path)) return;
  const ts = nowIso();
  db.insert(notFoundLog)
    .values({ path, count: 1, lastSeen: ts, referrer: referrer ?? null })
    .onConflictDoUpdate({
      target: notFoundLog.path,
      set: { count: sql`${notFoundLog.count} + 1`, lastSeen: ts, referrer: sql`coalesce(${notFoundLog.referrer}, ${referrer ?? null})` },
    })
    .run();
  evict404Overflow(db);
}

/** Keep the table at `NOT_FOUND_MAX_ROWS`, dropping the least-hit paths first. */
export function evict404Overflow(db: DB, max = NOT_FOUND_MAX_ROWS): number {
  const total = db.select({ n: sql<number>`count(*)` }).from(notFoundLog).get()?.n ?? 0;
  const over = total - max;
  if (over <= 0) return 0;
  const doomed = db
    .select({ path: notFoundLog.path })
    .from(notFoundLog)
    .orderBy(asc(notFoundLog.count), asc(notFoundLog.lastSeen))
    .limit(over)
    .all()
    .map((r) => r.path);
  if (doomed.length) db.delete(notFoundLog).where(inArray(notFoundLog.path, doomed)).run();
  return doomed.length;
}

const Report404Body = z.object({
  path: z.string().min(1),
  referrer: z.string().max(2048).nullish(),
});

/**
 * Mounted by the HTTP layer at `/api/public`, i.e. `GET /api/public/resolve` and
 * `POST /api/public/404`. Takes the db explicitly because Hono sub-apps carry no deps.
 */
export function publicRedirectRoutes(db: DB) {
  const app = new Hono();

  app.get("/resolve", (c) => {
    const path = c.req.query("path");
    if (!path) return c.json({ redirect: null });
    return c.json({ redirect: resolveRedirect(db, path) });
  });

  // Called from a page that is already rendering a 404, so it never fails the caller:
  // bad input, a rate limit and a filtered path all answer `{ ok: true }`.
  app.post("/404", async (c) => {
    const ip = clientIp(c.req.raw, c.env);
    if (consume(notFoundReportLimiter, `404:${ip}`).limited) return c.json({ ok: true });
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: true });
    }
    const parsed = Report404Body.safeParse(body);
    if (!parsed.success) return c.json({ ok: true });
    try {
      record404(db, parsed.data.path, parsed.data.referrer ?? null);
    } catch (e) {
      console.warn("[404log]", (e as Error).message);
    }
    return c.json({ ok: true });
  });

  return app;
}
