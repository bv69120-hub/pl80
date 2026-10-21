const loopbackHosts = new Set(["127.0.0.1", "::1", "localhost"]);
const systemSid = "S-1-5-18";
const administratorsSid = "S-1-5-32-544";

export function isValidJwtSecret(secret: string | undefined): secret is string {
  if (!secret) return false;
  if (/^[A-Fa-f0-9]{64}$/.test(secret)) return true;
  if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) return false;
  const decoded = Buffer.from(secret, "base64url");
  return decoded.length === 32 && decoded.toString("base64url") === secret;
}

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!isValidJwtSecret(secret)) {
    throw new Error(
      "JWT_SECRET is missing or invalid. Configure a cryptographically random 256-bit key.",
    );
  }
  return secret;
}

export function getApiAllowedOrigins() {
  const value = process.env.API_ALLOWED_ORIGINS?.trim();
  if (!value) return [];
  const origins = value.split(",").map((origin) => origin.trim());
  for (const origin of origins) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error("API_ALLOWED_ORIGINS must contain explicit HTTP or HTTPS origins.");
    }
    if (
      parsed.origin !== origin ||
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    ) {
      throw new Error("API_ALLOWED_ORIGINS must contain explicit HTTP or HTTPS origins.");
    }
  }
  if (new Set(origins).size !== origins.length) {
    throw new Error("API_ALLOWED_ORIGINS must not contain duplicate origins.");
  }
  return origins;
}

export function getApiHost() {
  const host = process.env.API_HOST?.trim() || "127.0.0.1";
  const explicitlyLanEnabled = process.env.API_ALLOW_LAN === "true";
  if (!loopbackHosts.has(host) && !explicitlyLanEnabled) {
    throw new Error("Non-loopback API binding requires API_ALLOW_LAN=true.");
  }
  if (explicitlyLanEnabled && getApiAllowedOrigins().length === 0) {
    throw new Error("API_ALLOW_LAN requires explicit API_ALLOWED_ORIGINS.");
  }
  return host;
}

export function assertRuntimeSecurityConfig() {
  getJwtSecret();
  getApiHost();
}

export function isAllowedApiOrigin(origin: string) {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (
    parsed.protocol === "http:" &&
    loopbackHosts.has(parsed.hostname) &&
    !parsed.username &&
    !parsed.password
  ) {
    return true;
  }
  return getApiAllowedOrigins().includes(origin);
}

export const runtimeSecurityPolicy = {
  minimumJwtSecretBytes: 32,
  loopbackHosts: [...loopbackHosts],
  allowedAdministrativeSids: [systemSid, administratorsSid],
} as const;
