import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { ToolCatalog, ToolDescriptions, type Post } from "@wove/sdk";
import { aiUsage, posts } from "../db/schema";
import { defineTool, notFound, ToolError, type Ctx } from "./registry";
import { postCreate } from "./content";
import { decodeCursor, encodeCursor } from "./shared";
import { DEFAULT_MAX_TOKENS, DEFAULT_MODELS, KNOWN_MODELS } from "../ai/defaults";
import { aiConfig, clearSiteKey, readAiSettings, resolveKey, storeSiteKey, writeAiSettings } from "../ai/keys";
import { createProviderClient } from "../ai/provider";
import { DRAFT_RETRY_NUDGE, baseSystemPrompt, draftPostSystem, parseDraftJson, rewriteSystem, withPostContext } from "../ai/prompts";
import { meteredGenerate, openSession } from "../ai/run";

const D = ToolDescriptions;

// ---------------------------------------------------------------- config

export const aiConfigTool = defineTool({
  name: "ai.config",
  description: D["ai.config"],
  input: ToolCatalog["ai.config"].input,
  output: ToolCatalog["ai.config"].output,
  scopes: ToolCatalog["ai.config"].scopes,
  mutation: false,
  handler: (ctx) => aiConfig(ctx.db),
});

export const aiConfigure = defineTool({
  name: "ai.configure",
  description: D["ai.configure"],
  input: ToolCatalog["ai.configure"].input,
  output: ToolCatalog["ai.configure"].output,
  scopes: ToolCatalog["ai.configure"].scopes,
  handler: (ctx, input) => {
    const before = readAiSettings(ctx.db);
    const provider = input.provider ?? before.provider;

    // Switching provider (or arriving with no model) pre-fills that provider's default.
    let model = input.model;
    if (model === undefined && (input.provider !== undefined ? provider !== before.provider : !before.model)) {
      model = DEFAULT_MODELS[provider] || undefined;
    }

    writeAiSettings(ctx.db, {
      provider: input.provider,
      model,
      baseUrl: input.baseUrl,
      systemPrompt: input.systemPrompt,
    });

    if (input.clearKey) clearSiteKey(ctx.db);
    if (input.apiKey) storeSiteKey(ctx.db, input.apiKey);

    return aiConfig(ctx.db);
  },
});

export const aiModels = defineTool({
  name: "ai.models",
  description: D["ai.models"],
  input: ToolCatalog["ai.models"].input,
  output: ToolCatalog["ai.models"].output,
  scopes: ToolCatalog["ai.models"].scopes,
  mutation: false,
  handler: async (ctx, input) => {
    const settings = readAiSettings(ctx.db);
    const provider = input.provider ?? settings.provider;
    const { key } = resolveKey(ctx.db, provider);
    const known = KNOWN_MODELS[provider];
    // Hosted providers authenticate their list-models endpoint; without a key, offer the
    // built-in suggestions. Compatible endpoints (Ollama etc.) are tried whenever a baseUrl exists.
    const canQueryLive = provider === "openai-compatible" ? !!settings.baseUrl : !!key;
    if (!canQueryLive) return known;
    try {
      const client = await createProviderClient({
        provider,
        model: settings.provider === provider ? settings.model : DEFAULT_MODELS[provider],
        apiKey: key,
        baseUrl: settings.baseUrl,
      });
      const live = await client.listModels();
      const seen = new Set(live.map((m) => m.id));
      return [...live, ...known.filter((m) => !seen.has(m.id))];
    } catch (e) {
      if (known.length === 0) throw e;
      return known; // live lookup failed (bad key, network) — suggestions still beat an error
    }
  },
});

export const aiTest = defineTool({
  name: "ai.test",
  description: D["ai.test"],
  input: ToolCatalog["ai.test"].input,
  output: ToolCatalog["ai.test"].output,
  scopes: ToolCatalog["ai.test"].scopes,
  handler: async (ctx) => {
    const session = await openSession(ctx, 16);
    const started = performance.now();
    await meteredGenerate(ctx, session, "ai.test", {
      system: "You are a connectivity probe.",
      prompt: "Reply with OK",
      maxTokens: 16,
    });
    return {
      ok: true as const,
      provider: session.provider,
      model: session.model,
      keySource: session.keySource,
      latencyMs: Math.round(performance.now() - started),
    };
  },
});

// ---------------------------------------------------------------- generation

/** Shared by the tool and the SSE endpoint so both see identical context. */
export function generateSystemPrompt(ctx: Ctx, systemPrompt: string | null, postId?: string): string {
  const base = baseSystemPrompt(ctx.db, systemPrompt);
  if (!postId) return base;
  const row = ctx.db.select().from(posts).where(eq(posts.id, postId)).get();
  if (!row) throw notFound(`No post with id "${postId}"`);
  return withPostContext(base, { title: row.title, content: row.content });
}

export const aiGenerate = defineTool({
  name: "ai.generate",
  description: D["ai.generate"],
  input: ToolCatalog["ai.generate"].input,
  output: ToolCatalog["ai.generate"].output,
  scopes: ToolCatalog["ai.generate"].scopes,
  handler: async (ctx, input) => {
    const settings = readAiSettings(ctx.db);
    const system = generateSystemPrompt(ctx, settings.systemPrompt, input.postId);
    const session = await openSession(ctx, input.maxTokens ?? DEFAULT_MAX_TOKENS);
    const res = await meteredGenerate(ctx, session, "ai.generate", { system, prompt: input.prompt });
    return { text: res.text, model: res.model, usage: res.usage };
  },
});

export const aiRewrite = defineTool({
  name: "ai.rewrite",
  description: D["ai.rewrite"],
  input: ToolCatalog["ai.rewrite"].input,
  output: ToolCatalog["ai.rewrite"].output,
  scopes: ToolCatalog["ai.rewrite"].scopes,
  handler: async (ctx, input) => {
    const session = await openSession(ctx);
    const res = await meteredGenerate(ctx, session, "ai.rewrite", {
      system: rewriteSystem(session.system, input.instruction),
      prompt: input.text,
    });
    return { text: res.text, model: res.model, usage: res.usage };
  },
});

export const aiDraftPost = defineTool({
  name: "ai.draftPost",
  description: D["ai.draftPost"],
  input: ToolCatalog["ai.draftPost"].input,
  output: ToolCatalog["ai.draftPost"].output,
  scopes: ToolCatalog["ai.draftPost"].scopes,
  handler: async (ctx, input) => {
    const session = await openSession(ctx);
    const system = draftPostSystem(session.system);

    const first = await meteredGenerate(ctx, session, "ai.draftPost", { system, prompt: input.prompt });
    let draft = parseDraftJson(first.text);
    if (!draft) {
      // One retry with an explicit nudge; models drift into prose surprisingly often.
      const second = await meteredGenerate(ctx, session, "ai.draftPost", {
        system,
        prompt: `${input.prompt}\n\n${DRAFT_RETRY_NUDGE}`,
      });
      draft = parseDraftJson(second.text);
    }
    if (!draft) throw new ToolError("conflict", "The model did not return valid JSON for the draft. Try again or rephrase the prompt.");

    // Reuse post.create's handler so hooks, slug de-duping and terms behave identically,
    // with this call's actor + channel intact.
    const createInput = postCreate.input.parse({
      type: input.type,
      title: draft.title || "Untitled draft",
      content: draft.content,
      excerpt: draft.excerpt || undefined,
      status: "draft",
      terms: input.terms,
    });
    return (await postCreate.handler(ctx, createInput)) as Post;
  },
});

// ---------------------------------------------------------------- usage

export const aiUsageTool = defineTool({
  name: "ai.usage",
  description: D["ai.usage"],
  input: ToolCatalog["ai.usage"].input,
  output: ToolCatalog["ai.usage"].output,
  scopes: ToolCatalog["ai.usage"].scopes,
  mutation: false,
  handler: (ctx, input) => {
    const where = input.since ? gte(aiUsage.ts, input.since) : undefined;
    const offset = decodeCursor(input.cursor);
    const rows = ctx.db.select().from(aiUsage)
      .where(where)
      .orderBy(desc(aiUsage.ts), desc(aiUsage.id))
      .limit(input.limit + 1).offset(offset).all();

    // Totals span the whole filtered set, not just this page.
    const totals = ctx.db.select({
      calls: count(),
      inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)`,
      outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)`,
    }).from(aiUsage).where(where).get();

    return {
      items: rows.slice(0, input.limit).map((r) => ({
        id: r.id, ts: r.ts, actorKind: r.actorKind, actorId: r.actorId ?? null,
        channel: r.channel, tool: r.tool, provider: r.provider, model: r.model,
        inputTokens: r.inputTokens, outputTokens: r.outputTokens,
        keySource: r.keySource, durationMs: r.durationMs, ok: r.ok,
      })),
      nextCursor: rows.length > input.limit ? encodeCursor(offset + input.limit) : null,
      totals: {
        calls: Number(totals?.calls ?? 0),
        inputTokens: Number(totals?.inputTokens ?? 0),
        outputTokens: Number(totals?.outputTokens ?? 0),
      },
    };
  },
});

export const aiTools = [aiConfigTool, aiConfigure, aiModels, aiTest, aiGenerate, aiRewrite, aiDraftPost, aiUsageTool];
