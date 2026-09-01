import { NavLink, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import { apiLogout } from "../api";
import { useToast } from "../context/ToastContext";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/posts", label: "Posts" },
  { to: "/pages", label: "Pages" },
  { to: "/media", label: "Media" },
  { to: "/agents", label: "Agents" },
  { to: "/audit", label: "Audit Log" },
  { to: "/settings", label: "Settings" },
  { to: "/tools", label: "Tools" },
];

function linkClass(isActive: boolean): string {
  return (
    "block rounded-md px-3 py-2 text-sm font-medium transition-colors " +
    (isActive
      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100")
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

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

  return (
    <div className="flex min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-200 dark:border-zinc-800">
        <div className="px-4 py-5">
          <span className="text-lg font-bold">agentpress</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-2">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => linkClass(isActive)}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="truncate text-sm font-medium">{user?.name}</div>
          <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">{user?.email}</div>
          <button
            onClick={handleLogout}
            className="mt-2 text-xs font-medium text-red-600 hover:underline dark:text-red-400"
          >
            Log out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
