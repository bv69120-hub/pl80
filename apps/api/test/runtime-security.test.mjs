import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import process from "node:process";
import {
  assertRuntimeSecurityConfig,
  getApiAllowedOrigins,
  getApiHost,
  getJwtSecret,
  isAllowedApiOrigin,
  isValidJwtSecret,
} from "../dist/runtime-security.js";

const validSecret = randomBytes(32).toString("base64url");

test("JWT configuration accepts strong key encodings and rejects missing or weak values", () => {
  const original = process.env.JWT_SECRET;
  try {
    delete process.env.JWT_SECRET;
    assert.equal(isValidJwtSecret(undefined), false);
    assert.throws(() => getJwtSecret(), /JWT_SECRET is missing or invalid/);
    process.env.JWT_SECRET = "development-secret";
    assert.throws(() => getJwtSecret(), /JWT_SECRET is missing or invalid/);
    process.env.JWT_SECRET = randomBytes(32).toString("hex");
    assert.equal(isValidJwtSecret(process.env.JWT_SECRET), true);
    process.env.JWT_SECRET = validSecret;
    assert.equal(getJwtSecret(), validSecret);
  } finally {
    if (original === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = original;
  }
});

test("the API binds to loopback unless LAN access and exact browser origins are explicit", () => {
  const originalJwtSecret = process.env.JWT_SECRET;
  const originalHost = process.env.API_HOST;
  const originalAllowLan = process.env.API_ALLOW_LAN;
  const originalOrigins = process.env.API_ALLOWED_ORIGINS;
  try {
    process.env.JWT_SECRET = validSecret;
    delete process.env.API_HOST;
    delete process.env.API_ALLOW_LAN;
    delete process.env.API_ALLOWED_ORIGINS;
    assert.equal(getApiHost(), "127.0.0.1");
    assert.equal(isAllowedApiOrigin("http://localhost:5175"), true);
    assert.equal(isAllowedApiOrigin("https://untrusted.example"), false);
    assert.equal(isAllowedApiOrigin("null"), false);
    assert.equal(isAllowedApiOrigin("file://"), false);

    process.env.API_HOST = "0.0.0.0";
    assert.throws(() => getApiHost(), /API_ALLOW_LAN=true/);
    process.env.API_ALLOW_LAN = "true";
    assert.throws(() => getApiHost(), /API_ALLOWED_ORIGINS/);
    process.env.API_ALLOWED_ORIGINS = "http://192.168.1.11:5173";
    assert.equal(getApiHost(), "0.0.0.0");
    assert.deepEqual(getApiAllowedOrigins(), ["http://192.168.1.11:5173"]);
    assert.equal(isAllowedApiOrigin("http://192.168.1.11:5173"), true);
    assert.equal(isAllowedApiOrigin("http://192.168.1.11:5174"), false);
    process.env.API_ALLOWED_ORIGINS = "https://good.example, *";
    assert.throws(() => assertRuntimeSecurityConfig(), /explicit HTTP or HTTPS origins/);
  } finally {
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
    if (originalHost === undefined) delete process.env.API_HOST;
    else process.env.API_HOST = originalHost;
    if (originalAllowLan === undefined) delete process.env.API_ALLOW_LAN;
    else process.env.API_ALLOW_LAN = originalAllowLan;
    if (originalOrigins === undefined) delete process.env.API_ALLOWED_ORIGINS;
    else process.env.API_ALLOWED_ORIGINS = originalOrigins;
  }
});
