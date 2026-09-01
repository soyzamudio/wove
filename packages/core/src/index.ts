import { mkdirSync } from "node:fs";
import { openDb, defaultDbPath } from "./db";
import { hooks } from "./hooks";
import { loadPlugins, pluginsDir } from "./plugins";
import { registerCoreTools, registry } from "./tools";
import { mediaDir } from "./tools/media";
import { createApp, isSetupNeeded } from "./http";
import { startScheduler } from "./scheduler";
import { VERSION } from "./version";

export * from "./db";
export * from "./hooks";
export * from "./plugins";
export * from "./tools";
export * from "./auth";
export { createApp } from "./http";
export { buildOpenApi } from "./openapi";
export { createMcpHandler } from "./mcp";
export { VERSION } from "./version";
export * from "./scheduler";

export async function boot(opts: { dbPath?: string; port?: number } = {}) {
  const dbPath = opts.dbPath ?? defaultDbPath();
  mkdirSync(mediaDir(), { recursive: true });

  const db = openDb(dbPath);
  registerCoreTools(registry);
  const plugins = await loadPlugins(pluginsDir(), registry, hooks);

  const port = opts.port ?? Number(process.env.PORT ?? 4000);
  const baseUrl = process.env.AGENTPRESS_BASE_URL ?? `http://localhost:${port}`;
  const app = createApp({ db, hooks, registry, baseUrl });
  const scheduler = startScheduler(db, hooks);
  return { db, app, plugins, port, baseUrl, dbPath, scheduler };
}

if (import.meta.main) {
  const { app, plugins, port, dbPath, db, scheduler } = await boot();
  const server = Bun.serve({ port, fetch: app.fetch, idleTimeout: 60 });
  const setup = isSetupNeeded(db);
  console.log(
    [
      ``,
      `  agentpress core v${VERSION}`,
      `  ${"-".repeat(40)}`,
      `  http    http://localhost:${server.port}`,
      `  mcp     http://localhost:${server.port}/mcp`,
      `  db      ${dbPath}`,
      `  tools   ${registry.size} registered` +
        (plugins.length ? ` (plugins: ${plugins.map((p) => p.name).join(", ")})` : ""),
      `  sched   ${scheduler.enabled ? "on (scheduled posts publish every 30s)" : "off (AGENTPRESS_SCHEDULER=0)"}`,
      `  setup   ${setup ? "NEEDED — POST /api/auth/setup to create the first admin" : "complete"}`,
      ``,
    ].join("\n"),
  );
}
