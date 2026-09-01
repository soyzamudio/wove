import type { AiKeySource } from "@agentpress/sdk";
import { aiUsage } from "../db/schema";
import { newId, nowIso } from "../ids";
import type { Ctx } from "../tools/registry";
import { readAiSettings, resolveKey } from "./keys";
import { createProviderClient, type AiGenerateRequest, type AiProviderClient, type AiUsageTokens } from "./provider";
import { DEFAULT_MAX_TOKENS } from "./defaults";
import { baseSystemPrompt } from "./prompts";

export interface AiSession {
  client: AiProviderClient;
  provider: ReturnType<typeof readAiSettings>["provider"];
  model: string;
  keySource: AiKeySource;
  system: string;
  maxTokens: number;
}

/** Resolve config + key and build a provider client, ready to call. */
export async function openSession(ctx: Ctx, maxTokens = DEFAULT_MAX_TOKENS): Promise<AiSession> {
  const settings = readAiSettings(ctx.db);
  const { key, source } = resolveKey(ctx.db, settings.provider);
  const client = await createProviderClient({
    provider: settings.provider,
    model: settings.model,
    apiKey: key,
    baseUrl: settings.baseUrl,
  });
  return {
    client,
    provider: settings.provider,
    model: settings.model,
    keySource: source,
    system: baseSystemPrompt(ctx.db, settings.systemPrompt),
    maxTokens,
  };
}

export interface MeterInput {
  tool: string;
  provider: AiSession["provider"];
  model: string;
  keySource: AiKeySource;
  usage: AiUsageTokens;
  durationMs: number;
  ok: boolean;
}

/** One row per provider call — successes and failures alike. Tokens only; never prices. */
export function recordUsage(ctx: Ctx, m: MeterInput): void {
  try {
    ctx.db.insert(aiUsage).values({
      id: newId(),
      ts: nowIso(),
      actorKind: ctx.actor.kind,
      actorId: ctx.actor.id,
      channel: ctx.channel,
      tool: m.tool,
      provider: m.provider,
      model: m.model,
      inputTokens: m.usage.inputTokens,
      outputTokens: m.usage.outputTokens,
      keySource: m.keySource,
      durationMs: Math.round(m.durationMs),
      ok: m.ok,
    }).run();
  } catch {
    // metering must never break the request
  }
}

const ZERO = { inputTokens: 0, outputTokens: 0 };

/** Run one non-streaming generation and meter it, whatever the outcome. */
export async function meteredGenerate(
  ctx: Ctx,
  session: AiSession,
  tool: string,
  req: Omit<AiGenerateRequest, "maxTokens"> & { maxTokens?: number },
) {
  const started = performance.now();
  const base = { tool, provider: session.provider, model: session.model, keySource: session.keySource };
  try {
    const res = await session.client.generate({
      system: req.system,
      prompt: req.prompt,
      maxTokens: req.maxTokens ?? session.maxTokens,
    });
    recordUsage(ctx, { ...base, usage: res.usage, durationMs: performance.now() - started, ok: true });
    return res;
  } catch (e) {
    recordUsage(ctx, { ...base, usage: ZERO, durationMs: performance.now() - started, ok: false });
    throw e;
  }
}
