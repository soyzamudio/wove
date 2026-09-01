import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Hooks, HookMap, HookName, HookHandler } from "./hooks";
import { hooks as defaultHooks } from "./hooks";
import { registry as defaultRegistry, type Registry, type Tool } from "./tools/registry";

export interface Plugin {
  name: string;
  tools?: Tool<any, any>[];
  hooks?: { [N in HookName]?: HookHandler<N> };
}

export function definePlugin(p: Plugin): Plugin {
  return p;
}

export function registerPlugin(p: Plugin, reg: Registry = defaultRegistry, hooks: Hooks = defaultHooks): void {
  for (const t of p.tools ?? []) reg.register(t, { overwrite: true });
  const on = hooks.on.bind(hooks) as (name: string, fn: (payload: any) => unknown) => unknown;
  for (const [name, fn] of Object.entries(p.hooks ?? {})) {
    if (typeof fn === "function") on(name, fn as (payload: any) => unknown);
  }
}

export function pluginsDir(): string {
  return process.env.WOVE_PLUGINS_DIR ?? join(process.cwd(), "plugins");
}

/** Loads every `plugins/*.ts` module and registers its default (or named `plugin`) export. */
export async function loadPlugins(
  dir: string = pluginsDir(),
  reg: Registry = defaultRegistry,
  hooks: Hooks = defaultHooks,
): Promise<Plugin[]> {
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => /\.(ts|js|mjs)$/.test(f) && !f.endsWith(".d.ts"));
  } catch {
    return []; // no plugins dir is fine
  }
  const loaded: Plugin[] = [];
  for (const f of files.sort()) {
    const url = pathToFileURL(resolve(dir, f)).href;
    try {
      const mod = (await import(url)) as { default?: Plugin; plugin?: Plugin };
      const p = mod.default ?? mod.plugin;
      if (!p?.name) {
        console.warn(`[plugins] ${f}: no plugin export, skipping`);
        continue;
      }
      registerPlugin(p, reg, hooks);
      loaded.push(p);
    } catch (e) {
      console.error(`[plugins] failed to load ${f}:`, (e as Error).message);
    }
  }
  return loaded;
}
