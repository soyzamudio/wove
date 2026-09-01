import type { Menu, MenuItem } from "@agentpress/sdk";

/** Used when core has no menu configured for a location yet. */
const FALLBACK_ITEMS: Record<string, MenuItem[]> = {
  header: [
    { id: "fallback-home", label: "Home", href: "/" },
    { id: "fallback-blog", label: "Blog", href: "/blog" },
  ],
  footer: [],
};

/**
 * Pick the items for a menu location, falling back to a sane default when
 * core has no menu configured (or it's empty) for that location.
 * Pure function (no I/O) so it's directly unit-testable.
 */
export function resolveMenuItems(menus: Menu[], location: string): MenuItem[] {
  const menu = menus.find((m) => m.location === location);
  if (menu && menu.items.length > 0) return menu.items;
  return FALLBACK_ITEMS[location] ?? [];
}
