import { ToolCatalog } from "@agentpress/sdk";
import { registry, type Registry, type Tool } from "./registry";
import { contentTools } from "./content";
import { taxonomyTools } from "./taxonomy";
import { mediaTools } from "./media";
import { settingsTools } from "./settings";
import { agentTools } from "./agents";
import { auditTools } from "./audit";
import { aiTools } from "./ai";

export const coreTools: Tool<any, any>[] = [
  ...contentTools, ...taxonomyTools, ...mediaTools, ...settingsTools, ...agentTools, ...auditTools, ...aiTools,
];

/** Registers every tool in the SDK catalog. Throws if a catalog entry is unimplemented. */
export function registerCoreTools(reg: Registry = registry): Registry {
  for (const t of coreTools) reg.register(t, { overwrite: true });
  const missing = Object.keys(ToolCatalog).filter((n) => !reg.has(n));
  if (missing.length) throw new Error(`ToolCatalog entries not implemented: ${missing.join(", ")}`);
  return reg;
}

export * from "./registry";
export { mediaDir } from "./media";
export { readSettings } from "./shared";
