/**
 * Data retention.
 *
 * Audit rows, AI usage rows, trashed posts and finished import job files all accumulate
 * forever otherwise — on a small SQLite deployment the audit table is the one that grows
 * without bound. Each budget is a number of days; `0` keeps that kind forever.
 */
import { readdirSync, rmSync, statSync } from "node:fs";
import { and, eq, isNotNull, lt } from "drizzle-orm";
import type { DB } from "./db";
import { aiUsage, auditLog, posts } from "./db/schema";
import { retentionDays, type Env } from "./env";
import { importsDir } from "./import/jobs";

export interface RetentionSummary {
  auditLog: number;
  aiUsage: number;
  trashedPosts: number;
  importFiles: number;
}

export const EMPTY_SUMMARY: RetentionSummary = { auditLog: 0, aiUsage: 0, trashedPosts: 0, importFiles: 0 };

export const retentionPruned = (s: RetentionSummary) =>
  s.auditLog + s.aiUsage + s.trashedPosts + s.importFiles > 0;

const cutoffIso = (days: number, now: Date) => new Date(now.getTime() - days * 86_400_000).toISOString();

/** drizzle's bun-sqlite `.run()` returns bun:sqlite's `{ changes }`. */
const changes = (r: unknown) => Number((r as { changes?: number } | undefined)?.changes ?? 0);

/**
 * Prune everything that is past its budget. Never throws: a retention failure must not
 * take the scheduler (or boot) down.
 */
export function runRetention(db: DB, env: Env = process.env, now = new Date()): RetentionSummary {
  const days = retentionDays(env);
  const summary: RetentionSummary = { ...EMPTY_SUMMARY };

  if (days.auditLog > 0) {
    try {
      summary.auditLog = changes(db.delete(auditLog).where(lt(auditLog.ts, cutoffIso(days.auditLog, now))).run());
    } catch (e) {
      console.error("[retention] audit_log", (e as Error).message);
    }
  }

  if (days.aiUsage > 0) {
    try {
      summary.aiUsage = changes(db.delete(aiUsage).where(lt(aiUsage.ts, cutoffIso(days.aiUsage, now))).run());
    } catch (e) {
      console.error("[retention] ai_usage", (e as Error).message);
    }
  }

  if (days.trash > 0) {
    try {
      // Permanent: revisions and post_terms cascade with the row.
      summary.trashedPosts = changes(
        db
          .delete(posts)
          .where(
            and(
              eq(posts.status, "trashed"),
              isNotNull(posts.trashedAt),
              lt(posts.trashedAt, cutoffIso(days.trash, now)),
            ),
          )
          .run(),
      );
    } catch (e) {
      console.error("[retention] trashed posts", (e as Error).message);
    }
  }

  if (days.imports > 0) {
    const dir = importsDir();
    const cutoffMs = now.getTime() - days.imports * 86_400_000;
    try {
      for (const name of readdirSync(dir)) {
        if (!name.endsWith(".json")) continue;
        const path = `${dir}/${name}`;
        try {
          if (statSync(path).mtimeMs < cutoffMs) {
            rmSync(path, { force: true });
            summary.importFiles++;
          }
        } catch {
          /* raced with another writer; skip */
        }
      }
    } catch {
      /* no imports dir yet */
    }
  }

  return summary;
}

export function logRetention(summary: RetentionSummary): void {
  if (!retentionPruned(summary)) return;
  console.log(
    `[retention] pruned ${summary.auditLog} audit, ${summary.aiUsage} ai_usage, ` +
      `${summary.trashedPosts} trashed post(s), ${summary.importFiles} import file(s)`,
  );
}
