import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { setCachedUpdate } from "../updates";
import { ADMIN, makeHarness, unwrap } from "../test-helpers";

const h = makeHarness();
afterEach(() => setCachedUpdate(null));
afterAll(() => h.cleanup());

describe("site.info update banner", () => {
  test("is null when the update check has found nothing", async () => {
    const info = unwrap<any>(await h.call(ADMIN, "site.info", {}));
    expect(info.update).toBeNull();
    expect(typeof info.version).toBe("string");
  });

  test("surfaces the cached update with an install hint", async () => {
    setCachedUpdate({ latest: "9.9.9", url: "https://example.test/9.9.9", fetchedAt: new Date().toISOString() });
    const info = unwrap<any>(await h.call(ADMIN, "site.info", {}));
    expect(info.update).toEqual({
      latest: "9.9.9",
      url: "https://example.test/9.9.9",
      installHint: expect.any(String),
    });
    expect(info.update.installHint.length).toBeGreaterThan(0);
  });

  test("the output still matches the SDK schema", async () => {
    setCachedUpdate({ latest: "9.9.9", url: "https://example.test/9.9.9", fetchedAt: new Date().toISOString() });
    const { ToolCatalog } = await import("@wove/sdk");
    const info = unwrap(await h.call(ADMIN, "site.info", {}));
    expect(() => ToolCatalog["site.info"].output.parse(info)).not.toThrow();
  });
});
