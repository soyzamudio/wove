import {
  Bot,
  ExternalLink,
  FileText,
  Files,
  Image,
  LayoutDashboard,
  ScrollText,
  Settings as SettingsIcon,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  /** "Visit site" is an outbound link resolved at render time from settings.siteUrl. */
  external?: boolean;
  badge?: "draftPosts";
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
    ],
  },
  {
    label: "Agentic",
    items: [
      { to: "/agents", label: "Agents", icon: Bot },
      { to: "/tools", label: "Tools", icon: Wrench },
      { to: "/audit", label: "Audit log", icon: ScrollText },
    ],
  },
  {
    label: "System",
    items: [{ to: "/settings", label: "Settings", icon: SettingsIcon }],
  },
];
