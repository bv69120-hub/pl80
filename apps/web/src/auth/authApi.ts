import type { AuthenticatedUser, LoginResponse } from "./auth.types";
import { apiUrl } from "../api/apiUrl";

const tokenStorageKey = "bv-expedition-pro-token";

export function getStoredToken() {
  return window.localStorage.getItem(tokenStorageKey);
}

export function storeToken(token: string) {
  window.localStorage.setItem(tokenStorageKey, token);
}

export function clearStoredToken() {
  window.localStorage.removeItem(tokenStorageKey);
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const response = await fetch(apiUrl("/api/auth/login"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    throw new Error("Identifiants invalides");
  }

  return (await response.json()) as LoginResponse;
}

export async function fetchCurrentUser(token: string): Promise<AuthenticatedUser> {
  const response = await fetch(apiUrl("/api/auth/me"), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Session expirée");
  }

  const data = (await response.json()) as { user: AuthenticatedUser };
  return data.user;
}
