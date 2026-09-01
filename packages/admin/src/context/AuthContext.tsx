import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Scope, User, Actor, UserRole } from "@wove/sdk";
import { apiMe } from "../api";
import { hasScopes } from "../lib/roles";

interface AuthState {
  loading: boolean;
  user: User | null;
  actor: Actor | null;
  /** The signed-in user's role, or null while loading / signed out. */
  role: UserRole | null;
  /** UX-only permission check against the actor's scopes (core enforces for real). */
  can: (scopes: Scope[]) => boolean;
  /** null while loading; false once we know there is no user session (401). */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [actor, setActor] = useState<Actor | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const me = await apiMe();
      setUser(me?.user ?? null);
      setActor(me?.actor ?? null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const can = (scopes: Scope[]) => hasScopes(actor?.scopes, scopes);

  return (
    <AuthContext.Provider value={{ loading, user, actor, role: user?.role ?? null, can, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
