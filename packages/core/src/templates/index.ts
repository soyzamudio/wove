/** The built-in site templates, in the order the admin lists them. */
import type { SiteTemplate } from "@wove/sdk";
import { saasTemplate } from "./saas";
import { portfolioTemplate } from "./portfolio";
import { magazineTemplate } from "./magazine";
import { localBusinessTemplate } from "./local-business";

export const BUILTIN_TEMPLATES: SiteTemplate[] = [
  saasTemplate,
  portfolioTemplate,
  magazineTemplate,
  localBusinessTemplate,
];

export const builtinTemplate = (slug: string): SiteTemplate | undefined =>
  BUILTIN_TEMPLATES.find((t) => t.meta.slug === slug);

export { saasTemplate, portfolioTemplate, magazineTemplate, localBusinessTemplate };
export { defineTemplate } from "./util";
