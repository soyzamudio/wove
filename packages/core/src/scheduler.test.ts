import { describe, expect, test } from "bun:test";
import { desc, eq } from "drizzle-orm";
import { auditLog } from "./db/schema";
import { publishDue, startScheduler } from "./scheduler";
import { ADMIN, makeHarness, unwrap } from "./test-helpers";

const h = makeHarness();

describe("scheduler", () => {
  test("publishes posts whose time has come, and audits them as system", async () => {
    const due = unwrap(await h.call(ADMIN, "post.create", { title: "Due now" }));
    unwrap(await h.call(ADMIN, "post.publish", { id: due.id, at: new Date(Date.now() - 60_000).toISOString() }));
    const later = unwrap(await h.call(ADMIN, "post.create", { title: "Due later" }));
    unwrap(await h.call(ADMIN, "post.publish", { id: later.id, at: new Date(Date.now() + 86_400_000).toISOString() }));
    const draft = unwrap(await h.call(ADMIN, "post.create", { title: "Still a draft" }));

    // `post.publish` with a past date already publishes, so force the row back to scheduled.
    expect(unwrap(await h.call(ADMIN, "post.get", { id: due.id })).status).toBe("published");
    unwrap(await h.call(ADMIN, "post.update", { id: due.id, status: "scheduled" }));
    expect(unwrap(await h.call(ADMIN, "post.get", { id: due.id })).status).toBe("scheduled");

    const seen: string[] = [];
    h.hooks.on("post.publish", (p) => void seen.push(p.post.id));

    const published = await publishDue(h.db, h.hooks);
    expect(published).toEqual([due.id]);
    expect(seen).toEqual([due.id]);

    expect(unwrap(await h.call(ADMIN, "post.get", { id: due.id })).status).toBe("published");
    expect(unwrap(await h.call(ADMIN, "post.get", { id: later.id })).status).toBe("scheduled");
    expect(unwrap(await h.call(ADMIN, "post.get", { id: draft.id })).status).toBe("draft");

    const row = h.db.select().from(auditLog).where(eq(auditLog.tool, "post.publish"))
      .orderBy(desc(auditLog.ts)).all().find((r) => r.channel === "system");
    expect(row).toBeTruthy();
    expect(row!.actorId).toBe("system");
    expect(row!.ok).toBe(true);

    // second pass is a no-op
    expect(await publishDue(h.db, h.hooks)).toEqual([]);
  });

  test("AGENTPRESS_SCHEDULER=0 disables the timer", () => {
    const prev = process.env.AGENTPRESS_SCHEDULER;
    process.env.AGENTPRESS_SCHEDULER = "0";
    const off = startScheduler(h.db, h.hooks);
    expect(off.enabled).toBe(false);
    off.stop();

    delete process.env.AGENTPRESS_SCHEDULER;
    const on = startScheduler(h.db, h.hooks);
    expect(on.enabled).toBe(true);
    on.stop();
    if (prev !== undefined) process.env.AGENTPRESS_SCHEDULER = prev;
  });
});
