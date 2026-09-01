import { and, eq, lte } from "drizzle-orm";
import type { Actor } from "@agentpress/sdk";
import type { DB } from "./db";
import { auditLog, posts } from "./db/schema";
import { hooks as defaultHooks, type Hooks } from "./hooks";
import { newId, nowIso } from "./ids";
import { hydratePost } from "./tools/shared";

/** How often the boot-time scheduler looks for due posts. */
export const SCHEDULER_INTERVAL_MS = 30_000;

/**
 * The scheduler acts on its own behalf. `Actor.kind` has no "system" member (it is a
 * *channel*), so system work is recorded as an agent with the reserved id "system" on the
 * `system` channel.
 */
export const SYSTEM_ACTOR_ID = "system";
const SYSTEM_ACTOR: Actor = { kind: "system", id: SYSTEM_ACTOR_ID, scopes: ["*"] };

/**
 * Flip every `scheduled` post whose `publishedAt` has arrived to `published`.
 * Exported so tests (and any host that prefers its own timer) can drive it directly.
 * Returns the ids that were published.
 */
export async function publishDue(db: DB, hooks: Hooks = defaultHooks, now = new Date()): Promise<string[]> {
  const iso = now.toISOString();
  const due = db
    .select()
    .from(posts)
    .where(and(eq(posts.status, "scheduled"), lte(posts.publishedAt, iso)))
    .all();
  const published: string[] = [];
  for (const row of due) {
    db.update(posts).set({ status: "published", updatedAt: nowIso() }).where(eq(posts.id, row.id)).run();
    const post = hydratePost(db, { ...row, status: "published" });
    await hooks.emit("post.publish", { post, ctx: { actor: SYSTEM_ACTOR, channel: "system" } });
    try {
      db.insert(auditLog).values({
        id: newId(),
        ts: nowIso(),
        actorKind: "system",
        actorId: SYSTEM_ACTOR_ID,
        channel: "system",
        tool: "post.publish",
        input: { id: row.id, scheduled: true },
        ok: true,
        error: null,
      }).run();
    } catch {
      // auditing must never break the scheduler
    }
    published.push(row.id);
  }
  return published;
}

export interface SchedulerHandle {
  stop(): void;
  enabled: boolean;
}

export function schedulerEnabled(): boolean {
  return process.env.AGENTPRESS_SCHEDULER !== "0";
}

/**
 * Run `publishDue` now and every 30s. The interval is `unref`'d, so it never keeps a
 * process alive on its own.
 */
export function startScheduler(db: DB, hooks: Hooks = defaultHooks): SchedulerHandle {
  if (!schedulerEnabled()) return { stop: () => {}, enabled: false };
  const tick = () => {
    void publishDue(db, hooks).catch((e) => console.error("[scheduler]", e));
  };
  tick();
  const timer = setInterval(tick, SCHEDULER_INTERVAL_MS);
  timer.unref?.();
  return { stop: () => clearInterval(timer), enabled: true };
}
