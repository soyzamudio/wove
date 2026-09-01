import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { LogOut, MoreVertical, Plus, Search } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { apiLogout, useToolQuery } from "../api";
import { useToast } from "../context/ToastContext";
import { collectionNavItems, visibleNavGroups, type NavItem } from "./nav";
import { CommandPalette } from "./CommandPalette";
import { ChatLauncher, ChatPanel } from "./ChatPanel";
import { ChatProvider, useChat } from "../context/ChatContext";
import { Logo } from "./Logo";
import { Avatar, Kbd, cx } from "./ui";

const ITEM_BASE =
  "group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
const ITEM_IDLE = "text-zinc-400 hover:bg-zinc-800/70 hover:text-white";
const ITEM_ACTIVE = "bg-zinc-800 text-white";
const NEW_BTN =
  "flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-700 px-2 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

export function Layout({ children }: { children: ReactNode }) {
  // Chat state lives above the route content so the conversation survives navigation.
  return (
    <ChatProvider>
      <LayoutShell>{children}</LayoutShell>
    </ChatProvider>
  );
}

function LayoutShell({ children }: { children: ReactNode }) {
  const { user, actor, refresh } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const chat = useChat();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Collections are user-defined content types, so their nav rows are data.
  const collections = useToolQuery("collection.list", {}, { staleTime: 60_000, retry: false });
  const collectionItems = useMemo(() => collectionNavItems(collections.data), [collections.data]);
  const navGroups = visibleNavGroups(actor?.scopes, collectionItems);

  const site = useToolQuery("site.info", {});
  const siteUrl = site.data?.settings.siteUrl || "";
  const draftPosts = useToolQuery("post.list", { type: "post", status: "draft", limit: 50 });
  const draftCount = draftPosts.data?.items.length ?? 0;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        chat.toggle();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chat]);

  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  async function handleLogout() {
    try {
      await apiLogout();
    } catch {
      // ignore - we're logging out either way
    } finally {
      await refresh();
      toast.success("Signed out");
      navigate("/login");
    }
  }

  function badgeFor(item: NavItem): number | null {
    if (item.badge === "draftPosts" && draftCount > 0) return draftCount;
    return null;
  }

  return (
    <div className="flex min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
      <aside className="wv-scroll sticky top-0 flex h-screen w-[260px] shrink-0 flex-col overflow-y-auto bg-zinc-950 text-zinc-300">
        <div className="flex items-center justify-between px-4 pb-3 pt-4">
          <span className="text-white">
            <Logo />
          </span>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-label="More options"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 z-30 mt-1 w-40 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 py-1 shadow-xl"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    handleLogout();
                  }}
                  className="block w-full px-3 py-1.5 text-left text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="px-3 pb-2">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex w-full items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="flex-1 text-left">Search…</span>
            <Kbd>⌘K</Kbd>
          </button>
        </div>

        <div className="flex gap-2 px-3 pb-3">
          <NavLink to="/posts/new" className={NEW_BTN}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            New post
          </NavLink>
          <NavLink to="/pages/new" className={NEW_BTN}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            New page
          </NavLink>
        </div>

        <nav className="flex-1 space-y-5 px-3 pb-4">
          {navGroups.map((group) => (
            <div key={group.label}>
              <div className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  if (item.external) {
                    return (
                      <a
                        key={item.label}
                        href={siteUrl || "#"}
                        target="_blank"
                        rel="noreferrer"
                        className={cx(ITEM_BASE, ITEM_IDLE, !siteUrl && "pointer-events-none opacity-40")}
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="flex-1 truncate">{item.label}</span>
                      </a>
                    );
                  }
                  const badge = badgeFor(item);
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) => cx(ITEM_BASE, isActive ? ITEM_ACTIVE : ITEM_IDLE)}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="flex-1 truncate">{item.label}</span>
                      {badge !== null && (
                        <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-400 group-hover:bg-zinc-700">
                          {badge}
                          {draftPosts.data?.nextCursor ? "+" : ""}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-auto flex items-center gap-2.5 border-t border-zinc-900 px-4 py-3">
          <NavLink
            to="/profile"
            title="Your profile"
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1 py-1 transition-colors hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Avatar name={user?.name} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-zinc-100">{user?.name}</div>
              <div className="truncate text-xs text-zinc-500">{user?.email}</div>
            </div>
          </NavLink>
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Sign out"
            title="Sign out"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-6 pb-10">{children}</main>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        extraCommands={[
          { label: "Site chat", hint: "⌘J", run: () => chat.setOpen(true) },
          ...collectionItems.map((item) => ({ label: item.label, hint: "Collections", to: item.to })),
        ]}
      />
      <ChatLauncher />
      <ChatPanel />
    </div>
  );
}
