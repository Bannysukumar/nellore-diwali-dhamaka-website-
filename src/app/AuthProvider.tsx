import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { UserProfile } from "@/types";
import { onAuthChange, signOutUser, type AuthUser } from "@/services/authService";

interface AuthContextValue {
  user: AuthUser | null;
  profile: UserProfile | null;
  uid: string | null;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  refresh: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthChange((next) => {
      setUser(next);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signOut = useCallback(async () => {
    await signOutUser();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile: user?.profile ?? null,
      uid: user?.uid ?? null,
      // UX only: mirrors the custom claim. Rules and functions enforce it.
      isAdmin: Boolean(user?.isAdmin && user.profile?.status !== "suspended"),
      loading,
      signOut,
      refresh: () => setUser((current) => (current ? { ...current } : current)),
    }),
    [user, loading, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>.");
  return ctx;
}
