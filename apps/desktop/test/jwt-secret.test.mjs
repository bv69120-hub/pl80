import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { test } from "node:test";
import { loadOrCreateJwtSecret } from "../dist/main/jwt-secret.js";

test("a generated JWT key is protected, persisted, and reused after restart", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bv-jwt-secret-"));
  const filePath = path.join(directory, "security", "jwt-secret");
  const protectedPaths = [];
  let generatedCount = 0;
  const options = {
    protectPath: async (targetPath, isDirectory) => {
      protectedPaths.push({ targetPath, isDirectory });
    },
    generateSecret: () => {
      generatedCount += 1;
      return Buffer.alloc(32, 7).toString("base64url");
    },
  };
  try {
    const first = await loadOrCreateJwtSecret(filePath, options);
    const second = await loadOrCreateJwtSecret(filePath, options);
    assert.match(first, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(second, first);
    assert.equal(await readFile(filePath, "utf8"), first);
    assert.notEqual(await readFile(`${filePath}.initialized`, "utf8"), "");
    assert.equal(generatedCount, 1);
    assert.deepEqual(
      protectedPaths.map(({ isDirectory }) => isDirectory),
      [true, false, false, true, false, false],
    );
    await rm(filePath);
    await assert.rejects(
      loadOrCreateJwtSecret(filePath, options),
      /persisted JWT secret is missing/,
    );
    assert.equal(generatedCount, 1);
    assert.deepEqual(
      protectedPaths.map(({ isDirectory }) => isDirectory),
      [true, false, false, true, false, false, true],
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("invalid persisted keys and permission failures prevent API startup", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bv-jwt-invalid-"));
  const filePath = path.join(directory, "security", "jwt-secret");
  try {
    await mkdir(path.dirname(filePath));
    await writeFile(filePath, "predictable-development-secret");
    await assert.rejects(
      loadOrCreateJwtSecret(filePath, { protectPath: async () => {} }),
      /persisted JWT secret is missing or invalid/,
    );
    await rm(filePath);
    await assert.rejects(
      loadOrCreateJwtSecret(filePath, {
        protectPath: async () => {
          throw new Error("ACL verification failed");
        },
      }),
      /ACL verification failed/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test(
  "the production Windows ACL configuration is applied and verified",
  { skip: process.platform !== "win32" },
  async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "bv-jwt-acl-"));
    const filePath = path.join(directory, "security", "jwt-secret");
    try {
      const firstSecret = await loadOrCreateJwtSecret(filePath);
      const secondSecret = await loadOrCreateJwtSecret(filePath);
      assert.equal(secondSecret, firstSecret);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
