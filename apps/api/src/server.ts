import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "./env.js";
import { assertRuntimeSecurityConfig, getApiHost } from "./runtime-security.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../");
const databasePackageRoot = path.join(repoRoot, "packages/database");
const envPath = path.join(repoRoot, ".env");

loadEnvFile(envPath);
process.chdir(databasePackageRoot);
assertRuntimeSecurityConfig();

console.info(`[api] PRINT_MODE = ${process.env.PRINT_MODE ?? "(default: windows)"}`);
console.info(`[api] SUMATRA_PATH = ${process.env.SUMATRA_PATH ?? "(unset)"}`);
console.info(`[api] LOCALAPPDATA = ${process.env.LOCALAPPDATA ?? "(unset)"}`);

const { createApp } = await import("./app.js");
const { printWorker } = await import("@bv/printer");
const { startCloudConnection } = await import("./cloud/cloud.connection.service.js");

const port = Number(process.env.PORT ?? 3333);
const host = getApiHost();

console.log(`[api] Database URL loaded: ${process.env.DATABASE_URL ? "oui" : "non"}`);

const app = createApp();
void printWorker.start();
startCloudConnection();

app.listen(port, host, () => {
  console.log(`BV Expédition Pro API listening on http://${host}:${port}`);
});
