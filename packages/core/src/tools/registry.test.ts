import { describe, expect, test, afterEach } from "bun:test";
import { count } from "drizzle-orm";
import { ToolCatalog } from "@wove/sdk";
import { auditLog } from "../db/schema";
import { ADMIN, ANON, EDITOR, makeHarness, unwrap } from "../test-helpers";

const h = makeHarness();
afterEach(() => {});

describe("registry + dispatch", () => {
  test("implements every tool in the SDK catalog", () => {
    for (const name of Object.keys(ToolCatalog)) expect(h.registry.has(name)).toBe(true);
  });

  test("rejects unknown tools with 404", async () => {
    const r = await h.call(ADMIN, "nope.nope");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(404);
  });

  test("validates input and returns 400 with details", async () => {
    const r = await h.call(ADMIN, "post.create", { title: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(400);
      expect(r.error.code).toBe("validation_error");
      expect(r.error.details).toBeTruthy();
    }
  });

  test("anon gets 401 on a scoped tool", async () => {
    const r = await h.call(ANON, "post.list", {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  test("editor is forbidden from agents:manage tools", async () => {
    const r = await h.call(EDITOR, "agent.list", {});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(403);
      expect(r.error.code).toBe("forbidden");
    }
  });

  test("admin `*` satisfies every scope", async () => {
    expect(unwrap<unknown[]>(await h.call(ADMIN, "agent.list", {}))).toEqual([]);
  });

  test("writes an audit row for a mutation and for a failure", async () => {
    const before = Number(h.db.select({ c: count() }).from(auditLog).get()?.c ?? 0);
    unwrap(await h.call(ADMIN, "post.create", { title: "Audited" }));
    await h.call(EDITOR, "agent.list", {}); // failure -> audited even though it is a read
    const all = h.db.select().from(auditLog).all();
    expect(all.length).toBe(before + 2);
    const rows = all.slice(before); // only the two rows this test produced
    const created = rows.find((r) => r.tool === "post.create")!;
    expect(created.ok).toBe(true);
    expect(created.actorKind).toBe("user");
    expect(created.channel).toBe("rest");
    const failed = rows.find((r) => r.tool === "agent.list")!;
    expect(failed.ok).toBe(false);
    expect(failed.error).toContain("Missing scope");
  });

  test("successful reads are not audited", async () => {
    const before = Number(h.db.select({ c: count() }).from(auditLog).get()?.c ?? 0);
    unwrap(await h.call(ADMIN, "post.list", {}));
    expect(Number(h.db.select({ c: count() }).from(auditLog).get()?.c ?? 0)).toBe(before);
  });

  test("redacts secret-bearing fields in the audit input", async () => {
    unwrap(await h.call(ADMIN, "media.upload", { filename: "a.txt", mime: "text/plain", base64: btoa("hi") }));
    const row = h.db.select().from(auditLog).all().find((r) => r.tool === "media.upload")!;
    expect((row.input as any).base64).toBe("[redacted]");
  });
});
