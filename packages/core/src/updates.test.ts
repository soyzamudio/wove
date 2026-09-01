import { afterEach, describe, expect, test } from "bun:test";
import {
  UPDATE_FALLBACK_URL,
  UPDATE_URL,
  checkForUpdate,
  compareVersions,
  installHint,
  isNewerVersion,
  setCachedUpdate,
  updateCheckEnabled,
} from "./updates";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  setCachedUpdate(null);
});

/** Replace fetch with a router over url → response (or thrower). Records calls. */
function stubFetch(routes: Record<string, () => Response | Promise<Response>>) {
  const calls: string[] = [];
  globalThis.fetch = (async (input: any) => {
    const url = String(input);
    calls.push(url);
    const handler = routes[url];
    if (!handler) throw new Error(`unstubbed ${url}`);
    return await handler();
  }) as typeof fetch;
  return calls;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("compareVersions", () => {
  test("orders numerically, not lexically", () => {
    expect(compareVersions("0.10.0", "0.9.0")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.1")).toBe(-1);
    expect(compareVersions("2.0.0", "10.0.0")).toBe(-1);
  });

  test("ignores a v prefix on either side", () => {
    expect(compareVersions("v0.2.0", "0.2.0")).toBe(0);
    expect(compareVersions("0.2.0", "v0.1.9")).toBe(1);
    expect(compareVersions("V1.0.0", "v1.0.0")).toBe(0);
  });

  test("treats missing segments as zero", () => {
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    expect(compareVersions("1", "1.0.1")).toBe(-1);
  });

  test("ignores prerelease and build metadata", () => {
    expect(compareVersions("0.2.0-rc.1", "0.2.0")).toBe(0);
    expect(compareVersions("0.2.0+build.5", "0.2.0")).toBe(0);
  });

  test("garbage sorts as zero rather than throwing", () => {
    expect(compareVersions("", "0.0.0")).toBe(0);
    expect(compareVersions("not-a-version", "0.0.1")).toBe(-1);
  });

  test("isNewerVersion is strict", () => {
    expect(isNewerVersion("0.2.0", "0.1.0")).toBe(true);
    expect(isNewerVersion("0.2.0", "0.2.0")).toBe(false);
    expect(isNewerVersion("0.1.0", "0.2.0")).toBe(false);
  });
});

describe("installHint", () => {
  test("docker wins over everything else", () => {
    expect(installHint({ WOVE_DOCKER: "1", WOVE_ENV: "production" })).toBe(
      "docker compose pull && docker compose up -d",
    );
  });
  test("production without docker", () => {
    expect(installHint({ WOVE_ENV: "production" })).toBe("bun run update  # then restart the service");
  });
  test("development default", () => {
    expect(installHint({})).toBe("git pull && bun install");
    expect(installHint({ WOVE_ENV: "development", WOVE_DOCKER: "0" })).toBe("git pull && bun install");
  });
});

describe("checkForUpdate", () => {
  test("uses the primary feed when it answers", async () => {
    const calls = stubFetch({
      [UPDATE_URL]: () => json({ version: "0.3.0", url: "https://usewove.com/releases/0.3.0", notes: "hi" }),
    });
    expect(await checkForUpdate("0.2.0", {})).toEqual({
      latest: "0.3.0",
      url: "https://usewove.com/releases/0.3.0",
    });
    expect(calls).toEqual([UPDATE_URL]);
  });

  test("sends no query params and no extra headers", async () => {
    let seenInit: RequestInit | undefined;
    let seenUrl = "";
    globalThis.fetch = (async (input: any, init?: RequestInit) => {
      seenUrl = String(input);
      seenInit = init;
      return json({ version: "0.3.0", url: "https://x" });
    }) as typeof fetch;
    await checkForUpdate("0.2.0", {});
    expect(seenUrl).toBe(UPDATE_URL);
    expect(seenUrl).not.toContain("?");
    expect(seenInit && "headers" in seenInit).toBe(false);
    expect(seenInit && "body" in seenInit).toBe(false);
  });

  test("falls back to the GitHub release when the primary fails", async () => {
    const calls = stubFetch({
      [UPDATE_URL]: () => {
        throw new Error("network down");
      },
      [UPDATE_FALLBACK_URL]: () =>
        json({ tag_name: "v0.2.0", html_url: "https://github.com/soyzamudio/wove/releases/tag/v0.2.0" }),
    });
    expect(await checkForUpdate("0.1.0", {})).toEqual({
      latest: "0.2.0",
      url: "https://github.com/soyzamudio/wove/releases/tag/v0.2.0",
    });
    expect(calls).toEqual([UPDATE_URL, UPDATE_FALLBACK_URL]);
  });

  test("a non-2xx primary also falls back", async () => {
    stubFetch({
      [UPDATE_URL]: () => new Response("nope", { status: 503 }),
      [UPDATE_FALLBACK_URL]: () => json({ tag_name: "v9.0.0", html_url: "https://gh/9" }),
    });
    expect((await checkForUpdate("0.1.0", {}))?.latest).toBe("9.0.0");
  });

  test("returns null when both fail", async () => {
    const calls = stubFetch({
      [UPDATE_URL]: () => {
        throw new Error("down");
      },
      [UPDATE_FALLBACK_URL]: () => {
        throw new Error("also down");
      },
    });
    expect(await checkForUpdate("0.1.0", {})).toBeNull();
    expect(calls.length).toBe(2);
  });

  test("returns null (and clears the cache) when already up to date", async () => {
    setCachedUpdate({ latest: "9.9.9", url: "https://stale", fetchedAt: "2020-01-01T00:00:00.000Z" });
    stubFetch({ [UPDATE_URL]: () => json({ version: "0.2.0", url: "https://x" }) });
    expect(await checkForUpdate("0.2.0", {})).toBeNull();
    const { cachedUpdate } = await import("./updates");
    expect(cachedUpdate()).toBeNull();
  });

  test("WOVE_UPDATE_CHECK=0 makes no network call at all", async () => {
    const calls = stubFetch({});
    expect(updateCheckEnabled({ WOVE_UPDATE_CHECK: "0" })).toBe(false);
    expect(await checkForUpdate("0.1.0", { WOVE_UPDATE_CHECK: "0" })).toBeNull();
    expect(calls).toEqual([]);
  });

  test("a successful check populates the module cache with a timestamp", async () => {
    stubFetch({ [UPDATE_URL]: () => json({ version: "1.0.0", url: "https://u" }) });
    await checkForUpdate("0.1.0", {});
    const { cachedUpdate } = await import("./updates");
    const c = cachedUpdate();
    expect(c?.latest).toBe("1.0.0");
    expect(Number.isNaN(Date.parse(c!.fetchedAt))).toBe(false);
  });
});
