import { mkdirSync } from "node:fs";
import { closeDb, openDb, defaultDbPath } from "./db";
import { hooks } from "./hooks";
import { loadPlugins, pluginsDir } from "./plugins";
import { registerCoreTools, registry } from "./tools";
import { mediaDir } from "./tools/media";
import { createApp, isSetupNeeded } from "./http";
import { startScheduler } from "./scheduler";
import { adminDist, isProduction, mode, rateLimitEnabled, retentionDays, siteUpstream } from "./env";
import { VERSION } from "./version";

export * from "./db";
export * from "./hooks";
export * from "./plugins";
export * from "./tools";
export * from "./auth";
export { createApp } from "./http";
export { buildOpenApi, resetOpenApiCache } from "./openapi";
export { createMcpHandler } from "./mcp";
export { VERSION } from "./version";
export * from "./scheduler";
export * from "./env";
export * from "./ratelimit";
export * from "./retention";
export { createAdminServer } from "./static";
export { proxyRequest, isReservedPath } from "./proxy";

export async function boot(opts: { dbPath?: string; port?: number } = {}) {
  const dbPath = opts.dbPath ?? defaultDbPath();
  mkdirSync(mediaDir(), { recursive: true });

  const db = openDb(dbPath);
  registerCoreTools(registry);
  const plugins = await loadPlugins(pluginsDir(), registry, hooks);

  const port = opts.port ?? Number(process.env.PORT ?? 4000);
  const baseUrl = process.env.WOVE_BASE_URL ?? `http://localhost:${port}`;
  const app = createApp({ db, hooks, registry, baseUrl });
  const scheduler = startScheduler(db, hooks);
  return { db, app, plugins, port, baseUrl, dbPath, scheduler };
}

/** How long in-flight requests get to finish before the process exits anyway. */
export const SHUTDOWN_GRACE_MS = 5_000;

if (import.meta.main) {
  const { app, plugins, port, dbPath, db, scheduler } = await boot();

  // Counted so shutdown can wait for real work rather than a fixed sleep.
  let inFlight = 0;
  const server = Bun.serve({
    port,
    idleTimeout: 60,
    fetch: async (req, srv) => {
      inFlight++;
      try {
        return await app.fetch(req, srv);
      } finally {
        inFlight--;
      }
    },
  });

  const setup = isSetupNeeded(db);
  const upstream = siteUpstream();
  const production = isProduction();
  const days = retentionDays();
  console.log(
    [
      ``,
      `  wove core v${VERSION}`,
      `  ${"-".repeat(40)}`,
      `  mode    ${mode()}`,
      `  http    http://localhost:${server.port}`,
      `  mcp     http://localhost:${server.port}/mcp`,
      `  admin   ${production ? `/admin  (${adminDist()})` : "dev server on :5173 (not served by core)"}`,
      `  site    ${upstream ? `proxied from ${upstream}` : "not proxied (API only)"}`,
      `  db      ${dbPath}`,
      `  storage ${process.env.WOVE_STORAGE === "s3" ? "s3" : "local"}`,
      `  tools   ${registry.size} registered` +
        (plugins.length ? ` (plugins: ${plugins.map((p) => p.name).join(", ")})` : ""),
      `  sched   ${scheduler.enabled ? "on (scheduled posts publish every 30s)" : "off (WOVE_SCHEDULER=0)"}`,
      `  retain  ${
        scheduler.retention
          ? `audit ${days.auditLog}d, ai_usage ${days.aiUsage}d, trash ${days.trash}d, imports ${days.imports}d`
          : "off"
      }`,
      `  limits  ${rateLimitEnabled() ? "on (auth 10/min, ai per actor, anon tools 60/min)" : "off (WOVE_RATE_LIMIT=0)"}`,
      `  setup   ${setup ? "NEEDED — POST /api/auth/setup to create the first admin" : "complete"}`,
      ``,
    ].join("\n"),
  );

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[core] ${signal} — draining (up to ${SHUTDOWN_GRACE_MS / 1000}s)…`);
    // `false` = stop accepting new connections, let in-flight ones finish.
    server.stop(false);
    scheduler.stop();
    const deadline = Date.now() + SHUTDOWN_GRACE_MS;
    while (inFlight > 0 && Date.now() < deadline) {
      await Bun.sleep(50);
    }
    if (inFlight > 0) console.warn(`[core] ${inFlight} request(s) still running — closing anyway`);
    server.stop(true);
    closeDb(db);
    console.log("[core] stopped");
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}
