import { constants } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import type { Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog } from "electron";
import type { Express } from "express";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const API_PORT = 3333;
const FRONTEND_PORT = 5173;

let apiServer: Server | undefined;
let frontendServer: Server | undefined;
let stopPrintWorker: (() => void) | undefined;
let disconnectDatabase: (() => Promise<void>) | undefined;
let stopCloudConnection: (() => void) | undefined;

function listen(serverApp: Express, port: number, host: string) {
  return new Promise<Server>((resolve, reject) => {
    const server = serverApp.listen(port, host, () => resolve(server));
    server.once("error", reject);
  });
}

async function prepareRuntime() {
  const userData = app.getPath("userData");
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
  console.info(`[PRINT] SUMATRA_BUNDLED_PATH = ${process.env.SUMATRA_BUNDLED_PATH}`);
}

async function startEmbeddedServices() {
  await prepareRuntime();
  const [{ createApp, createFrontendApp }, { printWorker }, { prisma }, cloud] = await Promise.all([
    import("@bv/api"),
    import("@bv/printer"),
    import("@bv/database"),
    import("@bv/api/cloud"),
  ]);
  const webRoot = app.isPackaged
    ? path.join(process.resourcesPath, "web")
    : path.resolve(__dirname, "../../../web/dist");

  try {
    await prisma.$executeRawUnsafe('ALTER TABLE "PrintJob" ADD COLUMN "errorMessage" TEXT');
    console.info("[DATABASE] Added PrintJob.errorMessage");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("duplicate column name")) throw error;
  }

  apiServer = await listen(createApp(), API_PORT, "0.0.0.0");
  frontendServer = await listen(createFrontendApp(webRoot), FRONTEND_PORT, "0.0.0.0");
  void printWorker.start();
  cloud.startCloudConnection();
  stopCloudConnection = cloud.stopCloudConnection;
  stopPrintWorker = () => printWorker.stop();
  disconnectDatabase = () => prisma.$disconnect();
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

if (!app.requestSingleInstanceLock()) app.quit();

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
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on("second-instance", () => {
  const window = BrowserWindow.getAllWindows()[0];
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.focus();
});

app.on("before-quit", () => {
  stopPrintWorker?.();
  stopCloudConnection?.();
  apiServer?.close();
  frontendServer?.close();
  void disconnectDatabase?.();
});

app.on("window-all-closed", () => app.quit());
