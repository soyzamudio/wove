import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { and, count, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { join } from "node:path";
import type { Channel } from "@agentpress/sdk";
import type { DB } from "./db";
import { posts, postTerms, terms as termsTable, users } from "./db/schema";
import type { Hooks } from "./hooks";
import { hooks as defaultHooks } from "./hooks";
import { auditCall, hasScopes, registry as defaultRegistry, dispatch, ToolError, type Ctx, type Registry } from "./tools/registry";
import { streamSSE } from "hono/streaming";
import { generateSystemPrompt } from "./tools/ai";
import { readAiSettings } from "./ai/keys";
import { DEFAULT_MAX_TOKENS } from "./ai/defaults";
import { openSession, recordUsage } from "./ai/run";
import { rewriteSystem } from "./ai/prompts";
import { decodeCursor, encodeCursor, hydratePost, hydratePosts, readSettings } from "./tools/shared";
import { mediaDir, safeFilename } from "./tools/media";
import {
  clearedCookie, createSession, createUser, destroySession, publicUser,
  readSessionId, resolveActor, sessionCookie, userActor, verifyPassword,
} from "./auth";
import { buildOpenApi, jsonSchemaFor } from "./openapi";
import { createMcpHandler } from "./mcp";
import { VERSION } from "./version";

export const ALLOWED_ORIGINS = ["http://localhost:5173", "http://localhost:4321"];

export interface AppDeps {
  db: DB;
  hooks?: Hooks;
  registry?: Registry;
  baseUrl?: string;
}

const err = (code: string, message: string, details?: unknown) => ({ code, message, details });

export function createApp(deps: AppDeps) {
  const db = deps.db;
  const hooks = deps.hooks ?? defaultHooks;
  const registry = deps.registry ?? defaultRegistry;
  const baseUrl = deps.baseUrl ?? "http://localhost:4000";

  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: (o) => (o && ALLOWED_ORIGINS.includes(o) ? o : ALLOWED_ORIGINS[0]!),
      credentials: true,
      allowHeaders: ["content-type", "authorization", "x-ap-channel", "mcp-session-id", "mcp-protocol-version", "accept"],
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      exposeHeaders: ["mcp-session-id"],
    }),
  );

  // ------------------------------------------------------------ system
  app.get("/health", (c) =>
    c.json({ ok: true, version: VERSION, tools: registry.size, setupNeeded: isSetupNeeded(db) }));

  app.get("/api/openapi.json", (c) => c.json(buildOpenApi(registry, baseUrl)));

  app.get("/api/tools", (c) =>
    c.json({
      tools: registry.list().map((t) => ({
        name: t.name,
        description: t.description,
        scopes: t.scopes,
        mutation: t.mutation,
        inputSchema: jsonSchemaFor(t.input),
        outputSchema: jsonSchemaFor(t.output),
      })),
    }));

  // ------------------------------------------------------------ auth
  const SetupInput = z.object({ email: z.string().email(), name: z.string().min(1), password: z.string().min(8) });

  app.post("/api/auth/setup", async (c) => {
    if (!isSetupNeeded(db)) {
      return c.json(err("conflict", "Setup has already been completed"), 409);
    }
    const parsed = SetupInput.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json(err("validation_error", "Invalid setup payload", parsed.error.flatten()), 400);
    const user = await createUser(db, { ...parsed.data, role: "admin" });
    const session = createSession(db, user.id);
    c.header("set-cookie", sessionCookie(session.id));
    return c.json({ user: publicUser(user), actor: userActor(user) }, 201);
  });

  const LoginInput = z.object({ email: z.string().email(), password: z.string().min(1) });

  app.post("/api/auth/login", async (c) => {
    const parsed = LoginInput.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json(err("validation_error", "Invalid login payload", parsed.error.flatten()), 400);
    const user = db.select().from(users).where(eq(users.email, parsed.data.email.toLowerCase().trim())).get();
    if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return c.json(err("unauthenticated", "Invalid email or password"), 401);
    }
    const session = createSession(db, user.id);
    c.header("set-cookie", sessionCookie(session.id));
    return c.json({ user: publicUser(user), actor: userActor(user) });
  });

  app.post("/api/auth/logout", (c) => {
    const sid = readSessionId(c.req.raw);
    if (sid) destroySession(db, sid);
    c.header("set-cookie", clearedCookie());
    return c.json({ ok: true });
  });

  app.get("/api/auth/me", (c) => {
    const r = resolveActor(db, c.req.raw);
    if (r.actor.kind === "anon") return c.json(err("unauthenticated", "Not signed in"), 401);
    return c.json({ user: r.user ? publicUser(r.user) : null, actor: r.actor });
  });

  // ------------------------------------------------------------ tools
  app.post("/api/tools/:name", async (c) => {
    const { actor } = resolveActor(db, c.req.raw);
    const channel: Channel = c.req.header("x-ap-channel") === "ui" ? "ui" : "rest";
    const body = await c.req.json().catch(() => ({}));
    const result = await dispatch(c.req.param("name"), body, { actor, channel, db, hooks }, registry);
    if (!result.ok) return c.json(result.error, result.status as 400);
    return c.json(result.data as object);
  });


  // ------------------------------------------------------------ AI streaming
  const AiStreamInput = z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("generate"),
      prompt: z.string().min(1),
      postId: z.string().min(1).optional(),
      maxTokens: z.number().int().min(64).max(64000).optional(),
    }),
    z.object({
      kind: z.literal("rewrite"),
      text: z.string().min(1),
      instruction: z.string().min(1),
    }),
  ]);

  /**
   * Token-by-token counterpart of `ai.generate` / `ai.rewrite`. Same auth as the tool
   * endpoint; emits `token`, then `done` (or `error`). Audit + ai_usage rows are written
   * exactly as the tools would write them.
   */
  app.post("/api/ai/stream", async (c) => {
    const { actor } = resolveActor(db, c.req.raw);
    const channel: Channel = c.req.header("x-ap-channel") === "ui" ? "ui" : "rest";
    const ctx: Ctx = { actor, channel, db, hooks };
    const raw = await c.req.json().catch(() => ({}));

    const parsed = AiStreamInput.safeParse(raw);
    if (!parsed.success) return c.json(err("validation_error", "Invalid stream payload", parsed.error.flatten()), 400);
    const input = parsed.data;
    const tool = input.kind === "generate" ? "ai.generate" : "ai.rewrite";

    if (actor.kind === "anon") {
      auditCall(ctx, tool, input, false, "Authentication required");
      return c.json(err("unauthenticated", "Authentication required"), 401);
    }
    if (!hasScopes(actor, ["ai:use"])) {
      auditCall(ctx, tool, input, false, "Missing scope(s): ai:use");
      return c.json(err("forbidden", "Missing scope(s): ai:use", { required: ["ai:use"], granted: actor.scopes }), 403);
    }

    // Everything that can fail synchronously (missing key, unknown post) fails as JSON,
    // before a single SSE byte goes out.
    let session: Awaited<ReturnType<typeof openSession>>;
    let system: string;
    let prompt: string;
    try {
      const settings = readAiSettings(db);
      session = await openSession(
        ctx,
        input.kind === "generate" ? input.maxTokens ?? DEFAULT_MAX_TOKENS : DEFAULT_MAX_TOKENS,
      );
      if (input.kind === "generate") {
        system = generateSystemPrompt(ctx, settings.systemPrompt, input.postId);
        prompt = input.prompt;
      } else {
        system = rewriteSystem(session.system, input.instruction);
        prompt = input.text;
      }
    } catch (e) {
      const te = e instanceof ToolError ? e : new ToolError("internal_error", (e as Error).message);
      auditCall(ctx, tool, input, false, te.message);
      return c.json(err(te.code, te.message, te.details), te.status as 400);
    }

    const meta = { tool, provider: session.provider, model: session.model, keySource: session.keySource };

    return streamSSE(c, async (stream) => {
      const started = performance.now();
      try {
        let done = false;
        for await (const ev of session.client.stream({ system, prompt, maxTokens: session.maxTokens })) {
          if (ev.type === "token") {
            await stream.writeSSE({ event: "token", data: JSON.stringify({ text: ev.text }) });
          } else {
            done = true;
            recordUsage(ctx, { ...meta, usage: ev.usage, durationMs: performance.now() - started, ok: true });
            auditCall(ctx, tool, input, true, null);
            await stream.writeSSE({ event: "done", data: JSON.stringify({ usage: ev.usage, model: ev.model }) });
          }
        }
        if (!done) {
          const usage = { inputTokens: 0, outputTokens: 0 };
          recordUsage(ctx, { ...meta, usage, durationMs: performance.now() - started, ok: true });
          auditCall(ctx, tool, input, true, null);
          await stream.writeSSE({ event: "done", data: JSON.stringify({ usage, model: session.model }) });
        }
      } catch (e) {
        const te = e instanceof ToolError ? e : new ToolError("internal_error", (e as Error)?.message ?? "Stream failed");
        recordUsage(ctx, { ...meta, usage: { inputTokens: 0, outputTokens: 0 }, durationMs: performance.now() - started, ok: false });
        auditCall(ctx, tool, input, false, te.message);
        await stream.writeSSE({ event: "error", data: JSON.stringify({ code: te.code, message: te.message }) });
      }
    });
  });

  // ------------------------------------------------------------ public reads
  app.get("/api/public/settings", (c) => c.json(readSettings(db)));

  app.get("/api/public/terms", (c) => {
    const rows = db
      .select({
        id: termsTable.id, taxonomy: termsTable.taxonomy, slug: termsTable.slug,
        name: termsTable.name, count: sql<number>`count(${postTerms.postId})`.as("count"),
      })
      .from(termsTable)
      .leftJoin(postTerms, eq(postTerms.termId, termsTable.id))
      .groupBy(termsTable.id)
      .orderBy(termsTable.taxonomy, termsTable.name)
      .all();
    return c.json(rows.map((r) => ({ ...r, count: Number(r.count) })));
  });

  /** Only `published` rows whose publishedAt has actually arrived. Drafts + future scheduled are invisible. */
  const publicWhere = () =>
    and(eq(posts.status, "published"), lte(posts.publishedAt, new Date().toISOString()))!;

  app.get("/api/public/posts", (c) => {
    const q = c.req.query();
    const limit = Math.min(Math.max(Number(q.limit ?? 20) || 20, 1), 100);
    const offset = decodeCursor(q.cursor);
    const conds: any[] = [publicWhere()];
    if (q.type === "post" || q.type === "page") conds.push(eq(posts.type, q.type));
    if (q.term) {
      const ids = db.select({ postId: postTerms.postId }).from(postTerms)
        .innerJoin(termsTable, eq(postTerms.termId, termsTable.id))
        .where(eq(termsTable.slug, q.term)).all().map((r) => r.postId);
      if (ids.length === 0) return c.json({ items: [], nextCursor: null });
      conds.push(inArray(posts.id, ids));
    }
    const rows = db.select().from(posts).where(and(...conds))
      .orderBy(desc(posts.publishedAt), desc(posts.id))
      .limit(limit + 1).offset(offset).all();
    return c.json({
      items: hydratePosts(db, rows.slice(0, limit)),
      nextCursor: rows.length > limit ? encodeCursor(offset + limit) : null,
    });
  });

  app.get("/api/public/posts/:slug", (c) => {
    const row = db.select().from(posts)
      .where(and(eq(posts.slug, c.req.param("slug")), publicWhere()))
      .get();
    if (!row) return c.json(err("not_found", "Post not found"), 404);
    return c.json(hydratePost(db, row));
  });

  // ------------------------------------------------------------ media files
  app.get("/media/*", async (c) => {
    const rest = decodeURIComponent(c.req.path.slice("/media/".length));
    const name = safeFilename(rest);
    if (!name || name !== rest) return c.json(err("not_found", "File not found"), 404);
    const file = Bun.file(join(mediaDir(), name));
    if (!(await file.exists())) return c.json(err("not_found", "File not found"), 404);
    return new Response(file, {
      headers: { "content-type": file.type || "application/octet-stream", "cache-control": "public, max-age=31536000" },
    });
  });

  // ------------------------------------------------------------ MCP
  const mcp = createMcpHandler({
    db, hooks, registry,
    resolve: (req) => resolveActor(db, req).actor,
  });
  app.all("/mcp", (c) => mcp(c.req.raw));

  app.notFound((c) => c.json(err("not_found", `No route for ${c.req.method} ${c.req.path}`), 404));
  app.onError((e, c) => {
    console.error("[http]", e);
    return c.json(err("internal_error", e.message), 500);
  });

  return app;
}

export function isSetupNeeded(db: DB): boolean {
  return Number(db.select({ c: count() }).from(users).get()?.c ?? 0) === 0;
}
