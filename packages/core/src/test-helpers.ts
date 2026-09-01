import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Actor } from "@agentpress/sdk";
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
  const dir = mkdtempSync(join(tmpdir(), "agentpress-test-"));
  process.env.AGENTPRESS_MEDIA_DIR = join(dir, "media");
  const db = openDb(join(dir, "test.db"));
  const hooks = new Hooks();
  const registry = new Registry();
  registerCoreTools(registry);
  const app = createApp({ db, hooks, registry });
  return {
    db, hooks, registry, dir, app,
    ctx: (actor, channel = "rest") => ({ actor, channel, db, hooks }),
    call: (actor, name, input) => dispatch(name, input ?? {}, { actor, channel: "rest", db, hooks }, registry),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

export function unwrap<T = any>(r: Awaited<ReturnType<typeof dispatch>>): T {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.data as T;
}
