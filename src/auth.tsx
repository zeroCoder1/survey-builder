import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { AUTH_REQUIRED_EVENT, authApi, LOCAL_MODE, type User } from './api';

interface AuthState {
  user: User | null;
  needsSetup: boolean;
  /** Setup must be opened with the ?token=… link (production) */
  setupRequiresToken: boolean;
  loading: boolean;
  setUser: (u: User | null) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  needsSetup: false,
  setupRequiresToken: false,
  loading: false,
  setUser: () => undefined,
  signOut: async () => undefined,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [setupRequiresToken, setSetupRequiresToken] = useState(false);
  const [loading, setLoading] = useState(!LOCAL_MODE);

  useEffect(() => {
    if (LOCAL_MODE) return;
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((r: { user: User | null; needsSetup?: boolean; setupRequiresToken?: boolean }) => {
        setUser(r.user ?? null);
        setNeedsSetup(!!r.needsSetup);
        setSetupRequiresToken(!!r.setupRequiresToken);
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
    const expired = () => setUser(null);
    window.addEventListener(AUTH_REQUIRED_EVENT, expired);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, expired);
  }, []);

  const signOut = useCallback(async () => {
    await authApi.logout().catch(() => undefined);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, needsSetup, setupRequiresToken, loading, setUser: (u) => (setUser(u), setNeedsSetup(false)), signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

/** Admin pages: redirect to sign-in when there is no session (the static build has no accounts). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (LOCAL_MODE) return <>{children}</>;
  if (loading) return <div className="container muted">Loading…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}
