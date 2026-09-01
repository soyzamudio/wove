import { and, eq, lte } from "drizzle-orm";
import type { Actor } from "@wove/sdk";
import type { DB } from "./db";
import { auditLog, posts } from "./db/schema";
import { hooks as defaultHooks, type Hooks } from "./hooks";
import { newId, nowIso } from "./ids";
import { hydratePost } from "./tools/shared";
import { logRetention, runRetention, type RetentionSummary } from "./retention";
import { retentionDays, type Env } from "./env";
import { refreshUpdateCache, updateCheckEnabled } from "./updates";

/** How often the boot-time scheduler looks for due posts. */
export const SCHEDULER_INTERVAL_MS = 30_000;

/** How often retention runs. Also runs once at boot so a long-lived process is not required. */
export const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** How often we look for a newer Wove release. Also runs once at boot. */
export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

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
  /** True when at least one retention budget is non-zero. */
  retention: boolean;
  /** True when the daily update check is on (WOVE_UPDATE_CHECK !== "0"). */
  updates: boolean;
}

/** Retention is on unless every budget is explicitly zeroed. */
export function retentionEnabled(env: Env = process.env): boolean {
  const d = retentionDays(env);
  return d.auditLog > 0 || d.aiUsage > 0 || d.trash > 0 || d.imports > 0;
}

/** Run the retention sweep and log a one-line summary if anything went. */
export function sweepRetention(db: DB, env: Env = process.env): RetentionSummary {
  const summary = runRetention(db, env);
  logRetention(summary);
  return summary;
}

export function schedulerEnabled(): boolean {
  return process.env.WOVE_SCHEDULER !== "0";
}

/**
 * Run `publishDue` now and every 30s. The interval is `unref`'d, so it never keeps a
 * process alive on its own.
 */
export function startScheduler(db: DB, hooks: Hooks = defaultHooks, env: Env = process.env): SchedulerHandle {
  if (!schedulerEnabled()) return { stop: () => {}, enabled: false, retention: false, updates: false };
  const tick = () => {
    void publishDue(db, hooks).catch((e) => console.error("[scheduler]", e));
  };
  tick();
  const timer = setInterval(tick, SCHEDULER_INTERVAL_MS);
  timer.unref?.();

  const retention = retentionEnabled(env);
  let retentionTimer: ReturnType<typeof setInterval> | undefined;
  if (retention) {
    const sweep = () => {
      try {
        sweepRetention(db, env);
      } catch (e) {
        console.error("[retention]", e);
      }
    };
    sweep();
    retentionTimer = setInterval(sweep, RETENTION_INTERVAL_MS);
    retentionTimer.unref?.();
  }

  // Fire-and-forget: the check never blocks boot and never fails loudly.
  const updates = updateCheckEnabled(env);
  let updateTimer: ReturnType<typeof setInterval> | undefined;
  if (updates) {
    refreshUpdateCache(undefined, env);
    updateTimer = setInterval(() => refreshUpdateCache(undefined, env), UPDATE_CHECK_INTERVAL_MS);
    updateTimer.unref?.();
  }

  return {
    stop: () => {
      clearInterval(timer);
      if (retentionTimer) clearInterval(retentionTimer);
      if (updateTimer) clearInterval(updateTimer);
    },
    enabled: true,
    retention,
    updates,
  };
}
