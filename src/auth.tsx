import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { AUTH_REQUIRED_EVENT, authApi, LOCAL_MODE, type Session, type User, type Workspace } from './api';

interface AuthState {
  user: User | null;
  workspace: Workspace | null;
  workspaces: Workspace[];
  loading: boolean;
  /** Re-reads the session from the server (after sign-in, sign-up, joining or switching). */
  refresh: () => Promise<void>;
  switchWorkspace: (id: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  workspace: null,
  workspaces: [],
  loading: false,
  refresh: async () => undefined,
  switchWorkspace: async () => undefined,
  signOut: async () => undefined,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ user: null });
  const [loading, setLoading] = useState(!LOCAL_MODE);

  const refresh = useCallback(async () => {
    if (LOCAL_MODE) return;
    try {
      setSession(await authApi.me());
    } catch {
      setSession({ user: null });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const expired = () => setSession({ user: null });
    window.addEventListener(AUTH_REQUIRED_EVENT, expired);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, expired);
  }, [refresh]);

  const switchWorkspace = useCallback(
    async (id: string) => {
      await authApi.switchWorkspace(id);
      await refresh();
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    await authApi.logout().catch(() => undefined);
    setSession({ user: null });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user: session.user,
        workspace: session.workspace ?? null,
        workspaces: session.workspaces ?? [],
        loading,
        refresh,
        switchWorkspace,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

/** Signed-in pages: send visitors to sign-in first (the static build has no accounts). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (LOCAL_MODE) return <>{children}</>;
  if (loading) return <div className="container muted">Loading…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}
