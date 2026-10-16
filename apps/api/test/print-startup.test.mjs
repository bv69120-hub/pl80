import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import process from "node:process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { loadEnvFile } from "../dist/env.js";

const require = createRequire(import.meta.url);
const printerEntryPath = require.resolve("@bv/printer");
const printerWindowsPath = path.join(path.dirname(printerEntryPath), "printer.windows.js");
const { resolveSumatra } = await import(pathToFileURL(printerWindowsPath).href);

test("API environment loading resolves Sumatra from the printer package dist module", async () => {
  const previousSumatraPath = process.env.SUMATRA_PATH;
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "bv-api-print-test-"));
  const executablePath = path.join(temporaryDirectory, "SumatraPDF.exe");
  const envPath = path.join(temporaryDirectory, ".env");
  await writeFile(executablePath, "local Sumatra executable fixture");
  await writeFile(envPath, `SUMATRA_PATH="${executablePath}"\nUNRELATED_TEST_SETTING=ignored\n`);
  delete process.env.SUMATRA_PATH;

  try {
    loadEnvFile(envPath, ["SUMATRA_PATH"]);
    const result = resolveSumatra();

    assert.equal(require.resolve("@bv/printer"), printerEntryPath);
    assert.equal(result?.path, executablePath);
    assert.equal(result?.source, "sumatraPath");
    assert.equal(
      result?.sha256,
      createHash("sha256")
        .update(await readFile(executablePath))
        .digest("hex")
        .toUpperCase(),
    );
    assert.notEqual(process.env.UNRELATED_TEST_SETTING, "ignored");
  } finally {
    if (previousSumatraPath === undefined) delete process.env.SUMATRA_PATH;
    else process.env.SUMATRA_PATH = previousSumatraPath;
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
