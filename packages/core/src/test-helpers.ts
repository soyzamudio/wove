import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Actor } from "@wove/sdk";
import { openDb, type DB } from "./db";
import { Hooks } from "./hooks";
import { Registry, registerCoreTools, dispatch, type Ctx } from "./tools";
import { createApp } from "./http";

export interface Harness {
  db: DB;
  hooks: Hooks;
  registry: Registry;
  dir: string;
  app: ReturnType<typeof createApp>;
  ctx(actor: Actor, channel?: Ctx["channel"]): Ctx;
  call(actor: Actor, name: string, input?: unknown): ReturnType<typeof dispatch>;
  cleanup(): void;
}

export const ADMIN: Actor = { kind: "user", id: "u_admin", scopes: ["*"] };
export const EDITOR: Actor = {
  kind: "user", id: "u_editor",
  scopes: ["content:read", "content:write", "content:publish", "media:read", "media:write", "settings:read", "settings:write", "audit:read"],
};
export const ANON: Actor = { kind: "anon", id: null, scopes: [] };

export function makeHarness(): Harness {
  const dir = mkdtempSync(join(tmpdir(), "wove-test-"));
  process.env.WOVE_MEDIA_DIR = join(dir, "media");
  const db = openDb(join(dir, "test.db"));
  const hooks = new Hooks();
  const registry = new Registry();
  registerCoreTools(registry);
  const app = createApp({ db, hooks, registry });
  return {
    db, hooks, registry, dir, app,
    ctx: (actor, channel = "rest") => ({ actor, channel, db, hooks, registry }),
    call: (actor, name, input) => dispatch(name, input ?? {}, { actor, channel: "rest", db, hooks, registry }, registry),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

export function unwrap<T = any>(r: Awaited<ReturnType<typeof dispatch>>): T {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.data as T;
}

// ---------------------------------------------------------------- fake AI provider

import { setProviderFactory, type AiChatEvent, type AiChatRequest, type AiProviderClient } from "./ai/provider";
import { AI_KEYS } from "./ai/keys";
import { settings as settingsTable } from "./db/schema";
import { nowIso } from "./ids";

/** A scripted turn: the events one `chatStream` call yields (a `done` is appended if absent). */
export type ScriptedTurn = AiChatEvent[];

export interface ScriptedProvider {
  /** Every request the loop made, in order — for asserting on tools and message shape. */
  seen: AiChatRequest[];
  restore(): void;
}

/**
 * Installs a provider whose `chatStream` replays `turns` one call at a time. Exhausting the
 * script yields a bare `done`, so a runaway loop terminates instead of hanging the test.
 */
export function scriptChat(turns: ScriptedTurn[]): ScriptedProvider {
  const queue = [...turns];
  const seen: AiChatRequest[] = [];
  const restore = setProviderFactory((): AiProviderClient => ({
    async *chatStream(req) {
      seen.push(req);
      const turn = queue.shift() ?? [];
      for (const ev of turn) yield ev;
      if (!turn.some((e) => e.type === "done")) {
        yield { type: "done", usage: { inputTokens: 1, outputTokens: 2 }, stopReason: turn.some((e) => e.type === "toolUse") ? "tool_use" : "end" };
      }
    },
    async generate() { throw new Error("not scripted"); },
    async *stream() { throw new Error("not scripted"); },
    async listModels() { return []; },
  }));
  return { seen, restore };
}

/** Minimal AI config so `openSession` resolves a client. */
export function configureFakeAi(db: DB): void {
  const ts = nowIso();
  for (const [key, value] of [[AI_KEYS.provider, "openai"], [AI_KEYS.model, "fake-model"]] as const) {
    db.insert(settingsTable).values({ key, value, updatedAt: ts })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value, updatedAt: ts } }).run();
  }
  process.env.OPENAI_API_KEY = "test-key";
}
