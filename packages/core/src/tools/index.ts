import { ToolCatalog } from "@wove/sdk";
import { registry, type Registry, type Tool } from "./registry";
import { contentTools } from "./content";
import { taxonomyTools } from "./taxonomy";
import { mediaTools } from "./media";
import { settingsTools } from "./settings";
import { agentTools } from "./agents";
import { emailTools } from "./email";
import { userTools } from "./users";
import { auditTools } from "./audit";
import { aiTools } from "./ai";
import { blockTools } from "./blocks";
import { aiPageTools } from "./ai-pages";
import { menuTools } from "./menus";
import { designTools } from "./design";
import { importTools } from "./import";
import { exportTools } from "./export";
import { chatTools } from "./chat";
import { templateTools } from "./templates";
import { redirectTools } from "./redirects";

export const coreTools: Tool<any, any>[] = [
  ...contentTools, ...taxonomyTools, ...mediaTools, ...settingsTools, ...agentTools, ...userTools, ...emailTools, ...auditTools, ...aiTools, ...blockTools, ...aiPageTools, ...menuTools, ...designTools, ...importTools, ...exportTools, ...chatTools, ...templateTools, ...redirectTools,
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
export { readMenus, readMenu } from "./menus";
export { readDesign, writeDesign } from "./design";
export { buildSiteExport } from "./export";
export { decodeWxr, MAX_WXR_BYTES } from "./import";
export { BUILTIN_TEMPLATES } from "../templates";
export { publicRedirectRoutes, resolveRedirect, record404, shouldReport404 } from "./redirects";
