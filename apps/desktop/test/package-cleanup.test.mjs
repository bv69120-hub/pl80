import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const afterPack = require("../scripts/after-pack.cjs");

test("packaging removes local SQLite data and journals from the staged app", async () => {
  const appOutDir = await mkdtemp(path.join(os.tmpdir(), "bv-package-cleanup-"));
  const prismaDirectory = path.join(
    appOutDir,
    "resources",
    "app",
    "node_modules",
    "@bv",
    "database",
    "prisma",
  );
  try {
    await mkdir(prismaDirectory, { recursive: true });
    await writeFile(path.join(prismaDirectory, "dev.db"), "local data");
    await writeFile(path.join(prismaDirectory, "dev.db-wal"), "local journal");
    await writeFile(path.join(prismaDirectory, "schema.prisma"), "schema");
    await afterPack({ appOutDir });
    await assert.rejects(readFile(path.join(prismaDirectory, "dev.db")));
    await assert.rejects(readFile(path.join(prismaDirectory, "dev.db-wal")));
    assert.equal(await readFile(path.join(prismaDirectory, "schema.prisma"), "utf8"), "schema");
  } finally {
    await rm(appOutDir, { recursive: true, force: true });
  }
});
