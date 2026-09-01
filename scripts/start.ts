#!/usr/bin/env bun
/**
 * Production supervisor: starts core (API + admin static + site reverse-proxy)
 * and the built Astro site as two child processes, prefixes their stdio,
 * forwards termination signals, and exits non-zero if either child dies.
 *
 * Usage: `bun scripts/start.ts` (after `bun run build`).
 *
 * Env (all optional, sane defaults for the single-container deployment):
 *   PORT             core's HTTP port                        (default 4000)
 *   WOVE_SITE_PORT   the site's internal HTTP port            (default 4321)
 *   WOVE_SITE_URL    public URL of the site, e.g. https://example.com — used
 *                    for CORS + as the base the site reports back as its own
 *                    public origin (WOVE_PUBLIC_URL) unless that's set too
 *   WOVE_ADMIN_DIST  absolute path to the built admin SPA     (default packages/admin/dist)
 *   WOVE_DB          sqlite file path                         (default packages/core/data/wove.db)
 *   WOVE_MEDIA_DIR   local media storage directory             (default packages/core/data/media)
 */
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

const corePort = process.env.PORT ?? "4000";
const sitePort = process.env.WOVE_SITE_PORT ?? "4321";
const adminDist = process.env.WOVE_ADMIN_DIST ?? resolve(ROOT, "packages/admin/dist");
const siteEntry = resolve(ROOT, "packages/site/dist/server/entry.mjs");
const siteUpstream = `http://127.0.0.1:${sitePort}`;
const apiUpstream = `http://127.0.0.1:${corePort}`;
// Data lives under packages/core/data by convention (that's what core's own
// dev defaults resolve to when run with cwd=packages/core, and it's the
// directory the Dockerfile declares as a VOLUME). Pin it explicitly here
// since this supervisor runs core with cwd=ROOT, not packages/core.
const coreDataDir = resolve(ROOT, "packages/core/data");

type Child = {
  name: string;
  proc: ReturnType<typeof spawn>;
};

const children: Child[] = [];
let shuttingDown = false;
let exitCode = 0;

function prefixedPipe(name: string, stream: NodeJS.ReadableStream, out: NodeJS.WritableStream) {
  let buf = "";
  stream.on("data", (chunk: Buffer) => {
    buf += chunk.toString("utf8");
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) out.write(`[${name}] ${line}\n`);
  });
  stream.on("end", () => {
    if (buf.length) out.write(`[${name}] ${buf}\n`);
  });
}

function spawnChild(name: string, command: string, args: string[], env: NodeJS.ProcessEnv): Child {
  const proc = spawn(command, args, {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (proc.stdout) prefixedPipe(name, proc.stdout, process.stdout);
  if (proc.stderr) prefixedPipe(name, proc.stderr, process.stderr);

  proc.on("exit", (code, signal) => {
    if (shuttingDown) return;
    exitCode = code ?? 1;
    console.error(`[start] ${name} exited (code=${code ?? "null"} signal=${signal ?? "null"}) — shutting down`);
    shutdown();
  });

  const child = { name, proc };
  children.push(child);
  return child;
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { name, proc } of children) {
    if (proc.exitCode === null && !proc.killed) {
      console.log(`[start] stopping ${name}`);
      proc.kill("SIGTERM");
    }
  }
  // Give children a moment to exit cleanly, then force it.
  setTimeout(() => {
    for (const { proc } of children) {
      if (proc.exitCode === null && !proc.killed) proc.kill("SIGKILL");
    }
    process.exit(exitCode);
  }, 5000).unref();
}

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    console.log(`[start] received ${sig}`);
    shutdown();
  });
}

spawnChild("core", "bun", [resolve(ROOT, "packages/core/src/index.ts")], {
  ...process.env,
  WOVE_ENV: "production",
  PORT: corePort,
  WOVE_ADMIN_DIST: adminDist,
  WOVE_SITE_UPSTREAM: siteUpstream,
  WOVE_DB: process.env.WOVE_DB ?? resolve(coreDataDir, "wove.db"),
  WOVE_MEDIA_DIR: process.env.WOVE_MEDIA_DIR ?? resolve(coreDataDir, "media"),
});

const sitePublicUrl = process.env.WOVE_PUBLIC_URL ?? process.env.WOVE_SITE_URL;
const siteEnv: NodeJS.ProcessEnv = {
  ...process.env,
  HOST: "127.0.0.1",
  PORT: sitePort,
  WOVE_API_URL: apiUpstream,
};
// Only set WOVE_PUBLIC_URL when we actually have a value — an empty string
// would defeat env.ts's own "fall back to WOVE_API_URL" default.
if (sitePublicUrl) siteEnv.WOVE_PUBLIC_URL = sitePublicUrl;

spawnChild("site", "bun", [siteEntry], siteEnv);

console.log(`[start] core   -> http://127.0.0.1:${corePort} (admin at /admin, site proxied for non-API routes)`);
console.log(`[start] site   -> http://127.0.0.1:${sitePort} (internal only)`);

// Wait forever; shutdown() calls process.exit() when done.
await new Promise(() => {});
