import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

function loadEnvFile(filePath) {
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

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const databasePackageRoot = path.join(repoRoot, "packages/database");
const envPath = path.join(repoRoot, ".env");

loadEnvFile(envPath);

const databaseUrl = process.env.DATABASE_URL ?? "file:./dev.db";
process.env.DATABASE_URL = databaseUrl;

const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(pnpmCommand, ["exec", "prisma", ...process.argv.slice(2)], {
  cwd: databasePackageRoot,
  shell: process.platform === "win32",
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: databaseUrl,
  },
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
