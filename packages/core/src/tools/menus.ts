import { eq } from "drizzle-orm";
import { z } from "zod";
import { Menu, ToolCatalog, ToolDescriptions, type MenuItem } from "@wove/sdk";
import type { DB } from "../db";
import { menus } from "../db/schema";
import { newId, nowIso } from "../ids";
import { badRequest, defineTool, notFound } from "./registry";

const D = ToolDescriptions;

/**
 * On the wire an item's `id` is optional — editors add rows without one and core assigns
 * it. Everything else is the SDK contract verbatim.
 */
type LooseMenuItemT = { id?: string; label: string; href: string; children?: LooseMenuItemT[] };
const LooseMenuItem: z.ZodType<LooseMenuItemT> = z.lazy(() =>
  z.object({
    id: z.string().optional(),
    label: z.string().min(1),
    href: z.string().min(1),
    children: z.array(LooseMenuItem).max(20).optional(),
  }),
);
const setInputSchema = ToolCatalog["menu.set"].input.extend({ items: z.array(LooseMenuItem).max(50) });

/**
 * Hrefs are rendered as links on the public site, so only shapes that cannot become
 * script/data URLs are allowed: site-relative paths, http(s), mailto: and in-page anchors.
 */
export function validateHref(href: string): void {
  const ok =
    href.startsWith("/") ||
    href.startsWith("#") ||
    href.startsWith("mailto:") ||
    /^https?:\/\//i.test(href);
  if (!ok) throw badRequest(`Invalid menu href "${href}" — use /path, https://…, mailto:… or #anchor`);
}

/** Fill in ids for items the caller left without one, and validate every href. */
export function normalizeItems(items: LooseMenuItemT[], depth = 0): MenuItem[] {
  if (depth > 1) throw badRequest("Menus support one level of nesting");
  return items.map((it) => {
    validateHref(it.href);
    const children = it.children?.length ? normalizeItems(it.children, depth + 1) : undefined;
    return { id: it.id || newId(), label: it.label, href: it.href, ...(children ? { children } : {}) };
  });
}

function rowToMenu(row: typeof menus.$inferSelect): Menu {
  const parsed = Menu.safeParse({ location: row.location, name: row.name, items: row.items ?? [] });
  return parsed.success ? parsed.data : { location: row.location, name: row.name, items: [] };
}

export function readMenus(db: DB): Menu[] {
  return db.select().from(menus).all().map(rowToMenu);
}

export function readMenu(db: DB, location: string): Menu | null {
  const row = db.select().from(menus).where(eq(menus.location, location)).get();
  return row ? rowToMenu(row) : null;
}

export const menuList = defineTool({
  name: "menu.list",
  description: D["menu.list"],
  input: ToolCatalog["menu.list"].input,
  output: ToolCatalog["menu.list"].output,
  scopes: ToolCatalog["menu.list"].scopes,
  mutation: false,
  handler: (ctx) => readMenus(ctx.db),
});

export const menuGet = defineTool({
  name: "menu.get",
  description: D["menu.get"],
  input: ToolCatalog["menu.get"].input,
  output: ToolCatalog["menu.get"].output,
  scopes: ToolCatalog["menu.get"].scopes,
  mutation: false,
  handler: (ctx, input) => {
    const menu = readMenu(ctx.db, input.location);
    if (!menu) throw notFound(`No menu at location "${input.location}"`);
    return menu;
  },
});

export const menuSet = defineTool({
  name: "menu.set",
  description: D["menu.set"],
  input: setInputSchema,
  output: ToolCatalog["menu.set"].output,
  scopes: ToolCatalog["menu.set"].scopes,
  handler: (ctx, input) => {
    const items = normalizeItems(input.items);
    const existing = readMenu(ctx.db, input.location);
    const name = input.name ?? existing?.name ?? input.location;
    const ts = nowIso();
    ctx.db.insert(menus)
      .values({ location: input.location, name, items, updatedAt: ts })
      .onConflictDoUpdate({ target: menus.location, set: { name, items, updatedAt: ts } })
      .run();
    return { location: input.location, name, items };
  },
});

export const menuDelete = defineTool({
  name: "menu.delete",
  description: D["menu.delete"],
  input: ToolCatalog["menu.delete"].input,
  output: ToolCatalog["menu.delete"].output,
  scopes: ToolCatalog["menu.delete"].scopes,
  handler: (ctx, input) => {
    if (!readMenu(ctx.db, input.location)) throw notFound(`No menu at location "${input.location}"`);
    ctx.db.delete(menus).where(eq(menus.location, input.location)).run();
    return { ok: true as const };
  },
});

export const menuTools = [menuList, menuGet, menuSet, menuDelete];
