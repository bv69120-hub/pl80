import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clearStoredToken,
  fetchCurrentUser,
  getStoredToken,
  login as loginRequest,
  storeToken,
} from "./authApi";
import type { AuthenticatedUser } from "./auth.types";
import { AuthContext } from "./AuthContext";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const currentUser = await fetchCurrentUser(token);

        if (isMounted) {
          setUser(currentUser);
        }
      } catch {
        clearStoredToken();

        if (isMounted) {
          setToken(null);
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void restoreSession();

    return () => {
      isMounted = false;
    };
  }, [token]);

  const login = useCallback(async (username: string, password: string) => {
    const result = await loginRequest(username, password);
    storeToken(result.token);
    setToken(result.token);
    setUser(result.user);
  }, []);

  const logout = useCallback(() => {
    clearStoredToken();
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      token,
      user,
      isLoading,
      isAuthenticated: Boolean(token && user),
      login,
      logout,
    }),
    [isLoading, login, logout, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
