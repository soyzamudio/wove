import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, readdirSync, writeFileSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { count, eq } from "drizzle-orm";
import { aiUsage, auditLog, posts } from "./db/schema";
import { newId } from "./ids";
import { runRetention, retentionPruned, EMPTY_SUMMARY } from "./retention";
import { retentionEnabled } from "./scheduler";
import { ADMIN, makeHarness, unwrap } from "./test-helpers";

const h = makeHarness();
afterAll(() => h.cleanup());

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const rows = (t: typeof auditLog | typeof aiUsage) => Number(h.db.select({ c: count() }).from(t as any).get()?.c ?? 0);

function addAudit(ts: string) {
  h.db.insert(auditLog).values({
    id: newId(), ts, actorKind: "system", actorId: "system", channel: "system",
    tool: "retention.fixture", input: {}, ok: true, error: null,
  }).run();
}

function addUsage(ts: string) {
  h.db.insert(aiUsage).values({
    id: newId(), ts, actorKind: "system", actorId: "system", channel: "system",
    tool: "ai.generate", provider: "anthropic", model: "m", inputTokens: 1, outputTokens: 1,
    keySource: "platform", durationMs: 1, ok: true,
  }).run();
}

describe("retention", () => {
  test("prunes audit, ai_usage, trashed posts and import files past their budgets", async () => {
    const importsDir = join(h.dir, "imports");
    mkdirSync(importsDir, { recursive: true });
    process.env.WOVE_IMPORTS_DIR = importsDir;

    addAudit(daysAgo(200));
    addAudit(daysAgo(100));
    addAudit(daysAgo(5));
    addUsage(daysAgo(400));
    addUsage(daysAgo(10));

    const old = unwrap(await h.call(ADMIN, "post.create", { title: "Ancient trash" }));
    const fresh = unwrap(await h.call(ADMIN, "post.create", { title: "Recent trash" }));
    const live = unwrap(await h.call(ADMIN, "post.create", { title: "Still here" }));
    unwrap(await h.call(ADMIN, "post.delete", { id: old.id }));
    unwrap(await h.call(ADMIN, "post.delete", { id: fresh.id }));
    h.db.update(posts).set({ trashedAt: daysAgo(90) }).where(eq(posts.id, old.id)).run();

    const stale = join(importsDir, "old.json");
    const recent = join(importsDir, "new.json");
    writeFileSync(stale, "{}");
    writeFileSync(recent, "{}");
    const staleSec = (Date.now() - 60 * 86_400_000) / 1000;
    utimesSync(stale, staleSec, staleSec);

    const auditBefore = rows(auditLog);
    const summary = runRetention(h.db, {});

    expect(summary.auditLog).toBe(2); // the 200d and 100d rows; the 5d one stays
    expect(summary.aiUsage).toBe(1);
    expect(summary.trashedPosts).toBe(1);
    expect(summary.importFiles).toBe(1);
    expect(retentionPruned(summary)).toBe(true);
    expect(rows(auditLog)).toBe(auditBefore - 2);

    expect(h.db.select().from(posts).where(eq(posts.id, old.id)).get()).toBeUndefined();
    expect(h.db.select().from(posts).where(eq(posts.id, fresh.id)).get()).toBeTruthy();
    expect(h.db.select().from(posts).where(eq(posts.id, live.id)).get()!.status).toBe("draft");

    const left = readdirSync(importsDir);
    expect(left).toContain("new.json");
    expect(left).not.toContain("old.json");

    // second pass is a no-op
    expect(runRetention(h.db, {})).toEqual(EMPTY_SUMMARY);
    delete process.env.WOVE_IMPORTS_DIR;
  });

  test("0 disables a budget", async () => {
    addAudit(daysAgo(500));
    addUsage(daysAgo(500));
    const before = rows(auditLog);
    const summary = runRetention(h.db, { WOVE_AUDIT_RETENTION_DAYS: "0", WOVE_AI_USAGE_RETENTION_DAYS: "0" });
    expect(summary.auditLog).toBe(0);
    expect(summary.aiUsage).toBe(0);
    expect(rows(auditLog)).toBe(before);
  });

  test("custom budgets are honoured", () => {
    const summary = runRetention(h.db, { WOVE_AUDIT_RETENTION_DAYS: "1" });
    expect(summary.auditLog).toBeGreaterThan(0);
  });

  test("retention is off only when every budget is zero", () => {
    expect(retentionEnabled({})).toBe(true);
    expect(retentionEnabled({ WOVE_AUDIT_RETENTION_DAYS: "0" })).toBe(true);
    expect(
      retentionEnabled({
        WOVE_AUDIT_RETENTION_DAYS: "0", WOVE_AI_USAGE_RETENTION_DAYS: "0",
        WOVE_TRASH_RETENTION_DAYS: "0", WOVE_IMPORTS_RETENTION_DAYS: "0",
      }),
    ).toBe(false);
  });
});
