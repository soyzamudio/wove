import {
  ArrowDownToLine,
  Bot,
  Database,
  ExternalLink,
  FileText,
  Files,
  Image,
  LayoutDashboard,
  LayoutTemplate,
  Menu,
  Route,
  ScrollText,
  Settings as SettingsIcon,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { resolveIcon } from "@wove/blocks";
import type { Collection, Scope, UserRole } from "@wove/sdk";
import { ROLE_SCOPES, hasScopes } from "../lib/roles";

/**
 * Nav icons are lucide components, but collection rows resolve theirs by name at
 * runtime — so the slot is typed structurally rather than as `LucideIcon`.
 */
export type NavIcon = LucideIcon;

export interface NavItem {
  to: string;
  label: string;
  icon: NavIcon;
  end?: boolean;
  /** "Visit site" is an outbound link resolved at render time from settings.siteUrl. */
  external?: boolean;
  badge?: "draftPosts";
  /** Hidden unless the actor holds every scope listed. UX only — core enforces. */
  scopes?: Scope[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "General",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
      { to: "", label: "Visit site", icon: ExternalLink, external: true },
    ],
  },
  {
    label: "Content",
    items: [
      { to: "/posts", label: "Posts", icon: FileText, badge: "draftPosts" },
      { to: "/pages", label: "Pages", icon: Files },
      { to: "/media", label: "Media", icon: Image },
      { to: "/collections", label: "Collections", icon: Database, scopes: ["settings:write"] },
      { to: "/menus", label: "Menus", icon: Menu, scopes: ["settings:write"] },
      { to: "/templates", label: "Templates", icon: LayoutTemplate, scopes: ["settings:write"] },
    ],
  },
  {
    label: "Agentic",
    items: [
      { to: "/agents", label: "Agents", icon: Bot, scopes: ["agents:manage"] },
      { to: "/tools", label: "Tools", icon: Wrench },
      { to: "/audit", label: "Audit log", icon: ScrollText, scopes: ["audit:read"] },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/settings", label: "Settings", icon: SettingsIcon, scopes: ["settings:read"] },
      { to: "/users", label: "Users", icon: Users, scopes: ["users:manage"] },
      { to: "/redirects", label: "Redirects", icon: Route, scopes: ["settings:write"] },
      { to: "/import", label: "Import / Export", icon: ArrowDownToLine, scopes: ["settings:write"] },
    ],
  },
];

/**
 * One nav row per collection, appended to the Content group: the collection's
 * lucide icon (falling back to a generic one) and its plural name.
 */
export function collectionNavItems(
  collections: ReadonlyArray<Pick<Collection, "slug" | "namePlural" | "icon">> | undefined | null
): NavItem[] {
  return (collections ?? []).map((c) => ({
    to: `/c/${c.slug}`,
    label: c.namePlural,
    icon: resolveIcon(c.icon) as unknown as NavIcon,
    scopes: ["content:read"],
  }));
}

/**
 * Nav groups an actor with these scopes may see; groups that end up empty are
 * dropped. `collectionItems` (from `collectionNavItems`) is appended after the
 * static Content entries.
 */
export function visibleNavGroups(
  scopes: readonly Scope[] | null | undefined,
  collectionItems: readonly NavItem[] = []
): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: (group.label === "Content" ? [...group.items, ...collectionItems] : group.items).filter((item) =>
      hasScopes(scopes, item.scopes)
    ),
  })).filter((group) => group.items.length > 0);
}

/** Flat list of nav labels a role sees — the pure surface the tests pin down. */
export function visibleNavLabels(role: UserRole): string[] {
  return visibleNavGroups(ROLE_SCOPES[role]).flatMap((g) => g.items.map((i) => i.label));
}
