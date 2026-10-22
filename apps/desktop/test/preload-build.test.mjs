import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("the packaged Electron preload is emitted as CommonJS at the configured path", async () => {
  const preloadPath = path.join(desktopRoot, "dist", "preload", "preload.cjs");
  const mainPath = path.join(desktopRoot, "dist", "main", "main.js");
  const [preload, main] = await Promise.all([
    readFile(preloadPath, "utf8"),
    readFile(mainPath, "utf8"),
  ]);
  assert.match(main, /preload\.cjs/);
  assert.match(preload, /require\(["']electron["']\)/);
  assert.match(preload, /getBootstrapToken/);
  assert.doesNotMatch(preload, /^\s*import\s/m);
  assert.doesNotMatch(preload, /BV_BOOTSTRAP_TOKEN|bootstrapToken\s*=/);
});
