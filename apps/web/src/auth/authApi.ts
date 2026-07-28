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
  const url = apiUrl("/api/auth/login");
  console.info(`[API] Login URL = ${url}`);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });
  } catch (error) {
    console.error("[API] Login fetch error", { url, error });
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Connexion impossible\nURL : ${url}\nErreur réseau/CORS : ${detail}`);
  }

  if (!response.ok) {
    let apiMessage = response.statusText;
    try {
      const body = (await response.json()) as { message?: unknown };
      if (typeof body.message === "string") apiMessage = body.message;
    } catch {
      // The status and URL remain available when the response is not JSON.
    }
    console.error("[API] Login HTTP error", { url, status: response.status, apiMessage });
    throw new Error(
      `Échec de connexion\nURL : ${url}\nStatut HTTP : ${response.status}\nAPI : ${apiMessage}`,
    );
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
