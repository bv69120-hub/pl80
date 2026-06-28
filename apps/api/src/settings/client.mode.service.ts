import { randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@bv/database";

const keys = {
  enabled: "CLIENT_MODE_ENABLED",
  token: "CLIENT_TOKEN",
  expiresAt: "CLIENT_TOKEN_EXPIRES_AT",
} as const;

function createToken() {
  return randomBytes(32).toString("hex");
}

async function ensureClientSettings() {
  const defaults = [
    { key: keys.enabled, value: "false" },
    { key: keys.token, value: createToken() },
    { key: keys.expiresAt, value: "" },
  ];
  await Promise.all(
    defaults.map((setting) =>
      prisma.setting.upsert({ where: { key: setting.key }, create: setting, update: {} }),
    ),
  );
}

export async function getClientMode() {
  await ensureClientSettings();
  const settings = await prisma.setting.findMany({ where: { key: { in: Object.values(keys) } } });
  const values = new Map(settings.map((setting) => [setting.key, setting.value]));
  const expiresAt = values.get(keys.expiresAt) || null;
  return {
    enabled: values.get(keys.enabled) === "true",
    token: values.get(keys.token) ?? "",
    expiresAt,
  };
}

export async function setClientModeEnabled(enabled: boolean) {
  await ensureClientSettings();
  await prisma.setting.update({ where: { key: keys.enabled }, data: { value: String(enabled) } });
  return getClientMode();
}

export async function regenerateClientToken() {
  await ensureClientSettings();
  await prisma.setting.update({ where: { key: keys.token }, data: { value: createToken() } });
  await prisma.setting.update({ where: { key: keys.expiresAt }, data: { value: "" } });
  return getClientMode();
}

export async function isClientTokenValid(candidate: string) {
  const mode = await getClientMode();
  if (!mode.enabled || !candidate || candidate.length !== mode.token.length) return false;
  if (mode.expiresAt && new Date(mode.expiresAt).getTime() <= Date.now()) return false;
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(mode.token));
}
