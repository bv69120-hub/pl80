interface BvDesktopBridge {
  isElectron?: boolean;
  isPackaged?: boolean;
  platform?: string;
}

declare global {
  interface Window {
    bvDesktop?: BvDesktopBridge;
  }
}

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
const packagedElectronApiUrl = "http://127.0.0.1:3333/api";
const isPackagedElectron =
  (window.bvDesktop?.isElectron === true && window.bvDesktop.isPackaged === true) ||
  new URLSearchParams(window.location.search).get("bv-desktop") === "packaged";
const apiBaseUrl = (
  isPackagedElectron
    ? packagedElectronApiUrl
    : configuredApiUrl || `${window.location.protocol}//${window.location.hostname}:3333`
).replace(/\/+$/, "");

if (window.bvDesktop?.isElectron || isPackagedElectron) {
  console.info(`[API] window.location.href = ${window.location.href}`);
  console.info(`[API] window.location.origin = ${window.location.origin}`);
  console.info(`[API] Base URL = ${apiBaseUrl}`);
}

export function apiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (apiBaseUrl.endsWith("/api") && normalizedPath.startsWith("/api/")) {
    return `${apiBaseUrl}${normalizedPath.slice(4)}`;
  }
  return `${apiBaseUrl}${normalizedPath}`;
}
