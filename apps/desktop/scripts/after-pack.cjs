/* global require, module */

// electron-builder loads package hooks as CommonJS modules.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require("node:path");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { rm } = require("node:fs/promises");

module.exports = async ({ appOutDir }) => {
  const databaseDirectory = path.join(
    appOutDir,
    "resources",
    "app",
    "node_modules",
    "@bv",
    "database",
    "prisma",
  );
  for (const fileName of ["dev.db", "dev.db-journal", "dev.db-wal", "dev.db-shm"]) {
    await rm(path.join(databaseDirectory, fileName), { force: true });
  }
};
