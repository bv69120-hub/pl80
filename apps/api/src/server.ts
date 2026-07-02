import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../");
const databasePackageRoot = path.join(repoRoot, "packages/database");
const envPath = path.join(repoRoot, ".env");

loadEnvFile(envPath);
process.chdir(databasePackageRoot);

const { createApp } = await import("./app.js");
const { printWorker } = await import("@bv/printer");
const { startCloudConnection } = await import("./cloud/cloud.connection.service.js");

const port = Number(process.env.PORT ?? 3333);
const host = process.env.HOST ?? "0.0.0.0";

console.log(`[api] Database URL loaded: ${process.env.DATABASE_URL ? "oui" : "non"}`);

const app = createApp();
void printWorker.start();
startCloudConnection();

app.listen(port, host, () => {
  console.log(`BV Expédition Pro API listening on http://${host}:${port}`);
});
