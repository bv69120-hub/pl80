import { createContext } from "react";
import type { AuthenticatedUser } from "./auth.types";

export interface AuthContextValue {
  token: string | null;
  user: AuthenticatedUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
