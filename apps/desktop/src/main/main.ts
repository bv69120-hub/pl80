import { constants } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import type { Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import type { Express } from "express";
import { loadEnvFile } from "@bv/api/env";
import { assertRuntimeSecurityConfig, getApiHost } from "@bv/api/security";
import { resolveSumatra } from "@bv/printer";
import { loadOrCreateJwtSecret } from "./jwt-secret.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const API_PORT = 3333;
const FRONTEND_PORT = 5173;
const execFileAsync = promisify(execFile);

let apiServer: Server | undefined;
let frontendServer: Server | undefined;
let printWorkerTask: Promise<void> | undefined;
let stopPrintWorker: (() => void) | undefined;
let disconnectDatabase: (() => Promise<void>) | undefined;
let stopCloudConnection: (() => void) | undefined;
let databaseClient: (typeof import("@bv/database"))["prisma"] | undefined;
let bootstrapToken: string | undefined;
let quitRequested = false;
let shutdownStarted = false;

app.setName("BV Expedition Pro");

const runtimeEnvironmentKeys = [
  "PRINT_MODE",
  "DEFAULT_PRINTER_NAME",
  "PRINT_COMMAND",
  "SUMATRA_PATH",
  "CLOUD_RELAY_URL",
  "CLOUD_PUBLIC_URL",
  "CLOUD_RELAY_ALLOW_INSECURE",
  "STORE_ID",
  "STORE_SECRET",
  "API_HOST",
  "API_ALLOW_LAN",
  "API_ALLOWED_ORIGINS",
];

function listen(serverApp: Express, port: number, host: string) {
  return new Promise<Server>((resolve, reject) => {
    const server = serverApp.listen(port, host, () => resolve(server));
    server.once("error", reject);
  });
}

async function prepareRuntime() {
  const userData = app.getPath("userData");
  await mkdir(userData, { recursive: true });
  loadEnvFile(path.join(userData, ".env"), runtimeEnvironmentKeys);

  if (!app.isPackaged) {
    loadEnvFile(path.resolve(__dirname, "../../../../.env"), runtimeEnvironmentKeys);
  }
  process.env.JWT_SECRET = await loadOrCreateJwtSecret(
    path.join(userData, "security", "jwt-secret"),
  );

  const dataDirectory = path.join(userData, "data");
  const databasePath = path.join(dataDirectory, "bv-expedition.db");
  const historyDirectory = path.join(userData, "print-history");
  await mkdir(dataDirectory, { recursive: true });
  await mkdir(historyDirectory, { recursive: true });

  try {
    await copyFile(
      path.join(process.resourcesPath, "database", "bv-expedition.db"),
      databasePath,
      constants.COPYFILE_EXCL,
    );
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    if (code !== "EEXIST") throw error;
  }

  process.env.DATABASE_URL = `file:${databasePath.replaceAll("\\", "/")}`;
  process.env.PRINT_HISTORY_DIR = historyDirectory;
  process.env.PRINT_MODE ??= "windows";
  process.env.DEFAULT_PRINTER_NAME ??= "PL80E";
  process.env.SUMATRA_BUNDLED_PATH = app.isPackaged
    ? path.join(process.resourcesPath, "tools", "SumatraPDF.exe")
    : path.resolve(__dirname, "../../build/tools/SumatraPDF.exe");
  process.env.BV_ELECTRON_LOCAL = "1";

  console.info(`[PRINT] PRINT_MODE = ${process.env.PRINT_MODE}`);
  console.info(`[PRINT] DEFAULT_PRINTER_NAME = ${process.env.DEFAULT_PRINTER_NAME}`);
}

async function startEmbeddedServices() {
  await prepareRuntime();
  assertRuntimeSecurityConfig();
  bootstrapToken = randomBytes(32).toString("hex");
  process.env.BV_BOOTSTRAP_TOKEN = bootstrapToken;
  const [{ createApp, createFrontendApp }, { printWorker }, { prisma }, cloud] = await Promise.all([
    import("@bv/api"),
    import("@bv/printer"),
    import("@bv/database"),
    import("@bv/api/cloud"),
  ]);
  const webRoot = app.isPackaged
    ? path.join(process.resourcesPath, "web")
    : path.resolve(__dirname, "../../../web/dist");
  databaseClient = prisma;
  disconnectDatabase = () => prisma.$disconnect();
  stopCloudConnection = cloud.stopCloudConnection;
  stopPrintWorker = () => printWorker.stop();

  await prisma
    .$executeRawUnsafe('ALTER TABLE "PrintJob" ADD COLUMN "errorMessage" TEXT')
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("duplicate column name")) throw error;
    });
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CarrierIncident" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "carrier" TEXT NOT NULL,
      "labelType" TEXT NOT NULL,
      "cropResult" TEXT NOT NULL,
      "issueType" TEXT NOT NULL,
      "printResult" TEXT NOT NULL,
      "physicalVerified" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "CarrierIncident_createdAt_idx" ON "CarrierIncident"("createdAt")',
  );

  apiServer = await listen(createApp(), API_PORT, getApiHost());
  frontendServer = await listen(createFrontendApp(webRoot), FRONTEND_PORT, getApiHost());
  printWorkerTask = printWorker.start();
  cloud.startCloudConnection();
  registerDesktopIpc();
}

function registerDesktopIpc() {
  ipcMain.handle("bv:get-bootstrap-token", async () => {
    if (!bootstrapToken || !databaseClient || (await databaseClient.user.count()) !== 0) {
      return null;
    }
    return bootstrapToken;
  });
  ipcMain.handle("bv:get-launch-at-login", () => app.getLoginItemSettings().openAtLogin);
  ipcMain.handle("bv:set-launch-at-login", (_event, enabled: unknown) => {
    if (typeof enabled !== "boolean") throw new TypeError("Valeur d’autostart invalide.");
    app.setLoginItemSettings({ openAtLogin: enabled });
    return app.getLoginItemSettings().openAtLogin;
  });
  ipcMain.handle("bv:get-desktop-status", async () => {
    const apiAvailable = await fetch(`http://127.0.0.1:${API_PORT}/health`)
      .then((response) => response.ok)
      .catch(() => false);
    const printerName = (process.env.DEFAULT_PRINTER_NAME ?? "PL80E").replaceAll("'", "''");
    let printerInstalled = false;
    let printerReady = false;
    let printerError: string | null = null;
    try {
      const script =
        `$printer = Get-Printer -Name '${printerName}' -ErrorAction Stop; ` +
        "$printer | Select-Object Name,PrinterStatus,WorkOffline | ConvertTo-Json -Compress";
      const { stdout } = await execFileAsync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", script],
        { windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024 },
      );
      const printer = JSON.parse(stdout) as {
        PrinterStatus?: string | number;
        WorkOffline?: boolean;
      };
      printerInstalled = true;
      printerReady =
        printer.WorkOffline !== true &&
        !/offline|error|not available/i.test(String(printer.PrinterStatus ?? ""));
    } catch {
      printerError = "Imprimante introuvable ou service d’impression indisponible.";
    }
    return {
      apiAvailable,
      printerInstalled,
      printerReady,
      printerError,
      sumatraAvailable: resolveSumatra() !== null,
      printerName: process.env.DEFAULT_PRINTER_NAME ?? "PL80E",
    };
  });
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1024,
    minHeight: 700,
    title: "BV Expédition Pro",
    icon: app.isPackaged
      ? path.join(process.resourcesPath, "icon.ico")
      : path.resolve(__dirname, "../../build/icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [`--bv-packaged=${String(app.isPackaged)}`],
    },
  });
  const packagedMarker = app.isPackaged ? "?bv-desktop=packaged" : "";
  await window.loadURL(`http://127.0.0.1:${FRONTEND_PORT}${packagedMarker}`);
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.whenReady().then(async () => {
    try {
      await startEmbeddedServices();
      await createWindow();
    } catch (error) {
      console.error(error);
      dialog.showErrorBox(
        "BV Expédition Pro",
        `Impossible de démarrer l’application. ${error instanceof Error ? error.message : ""}`,
      );
      app.quit();
      return;
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow();
    });
  });
}

app.on("second-instance", () => {
  const window = BrowserWindow.getAllWindows()[0];
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.focus();
});

app.on("before-quit", (event) => {
  if (quitRequested || shutdownStarted) return;
  event.preventDefault();
  shutdownStarted = true;
  void shutdown()
    .catch((error: unknown) => console.error("[APP] Service shutdown failed.", error))
    .finally(() => {
      quitRequested = true;
      app.quit();
    });
});

app.on("window-all-closed", () => app.quit());

async function shutdown() {
  stopPrintWorker?.();
  stopCloudConnection?.();
  const closeServer = (server: Server | undefined) =>
    server
      ? new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
          server.closeAllConnections();
        })
      : Promise.resolve();
  const results = await Promise.allSettled([
    closeServer(apiServer),
    closeServer(frontendServer),
    printWorkerTask ?? Promise.resolve(),
  ]);
  await disconnectDatabase?.();
  const errors = results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
  if (errors.length)
    throw new AggregateError(errors, "One or more desktop services did not stop cleanly.");
}
