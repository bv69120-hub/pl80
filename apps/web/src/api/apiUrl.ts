const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
const apiBaseUrl = (
  configuredApiUrl || `${window.location.protocol}//${window.location.hostname}:3333`
).replace(/\/+$/, "");

export function apiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (apiBaseUrl.endsWith("/api") && normalizedPath.startsWith("/api/")) {
    return `${apiBaseUrl}${normalizedPath.slice(4)}`;
  }
  return `${apiBaseUrl}${normalizedPath}`;
}
