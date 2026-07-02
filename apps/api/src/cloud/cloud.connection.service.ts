import os from "node:os";
import path from "node:path";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { prisma } from "@bv/database";
import {
  enqueuePrintJob,
  preparationData,
  prepareUploadedPdf,
} from "../print-jobs/print.jobs.routes.js";

type ConnectionState = "CONNECTED" | "CONNECTING" | "DISCONNECTED";
const MODE_KEY = "CONNECTION_MODE";
let socket: WebSocket | undefined;
let reconnectTimer: NodeJS.Timeout | undefined;
let state: ConnectionState = "DISCONNECTED";
let stopping = false;

export async function getConnectionMode(): Promise<"LOCAL" | "CLOUD"> {
  const setting = await prisma.setting.upsert({
    where: { key: MODE_KEY },
    create: { key: MODE_KEY, value: "LOCAL" },
    update: {},
  });
  return setting.value === "CLOUD" ? "CLOUD" : "LOCAL";
}

async function receiveJob(message: { id: string; filename: string; pdf: string }) {
  const pdf = Buffer.from(message.pdf, "base64");
  if (
    pdf.length === 0 ||
    pdf.length > 10 * 1024 * 1024 ||
    pdf.subarray(0, 5).toString() !== "%PDF-"
  )
    throw new Error("PDF cloud invalide");
  const temporaryPath = path.join(os.tmpdir(), "bv-expedition-pro", `${randomUUID()}.pdf`);
  await mkdir(path.dirname(temporaryPath), { recursive: true });
  await writeFile(temporaryPath, pdf);
  try {
    const file = { path: temporaryPath, originalname: message.filename } as Express.Multer.File;
    const { preparation, originalFilePath } = await prepareUploadedPdf(file);
    const job = await prisma.printJob.create({
      data: {
        filename: message.filename,
        status: "PENDING",
        source: "CLIENT",
        printerName: "PL80E",
        copies: 1,
        ...preparationData(preparation, originalFilePath),
      },
    });
    enqueuePrintJob({
      id: job.id,
      filename: job.filename,
      filePath: preparation.preparedPath,
      source: "CLIENT",
    });
    socket?.send(JSON.stringify({ type: "ack", id: message.id }));
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}

function scheduleReconnect() {
  if (stopping || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    void connect();
  }, 5_000);
}

async function connect() {
  if (stopping || (await getConnectionMode()) !== "CLOUD") return;
  const relayUrl = process.env.CLOUD_RELAY_URL;
  const storeId = process.env.STORE_ID;
  const storeSecret = process.env.STORE_SECRET;
  if (!relayUrl || !storeId || !storeSecret) {
    state = "DISCONNECTED";
    return;
  }
  if (!relayUrl.startsWith("wss://") && process.env.CLOUD_RELAY_ALLOW_INSECURE !== "true") {
    state = "DISCONNECTED";
    return;
  }
  state = "CONNECTING";
  const url = new URL(relayUrl);
  url.searchParams.set("storeId", storeId);
  socket = new WebSocket(url, { headers: { Authorization: `Bearer ${storeSecret}` } });
  socket.on("open", () => {
    state = "CONNECTED";
  });
  socket.on("message", (raw) => {
    try {
      const message = JSON.parse(raw.toString()) as {
        type?: string;
        id?: string;
        filename?: string;
        pdf?: string;
      };
      if (message.type === "job" && message.id && message.filename && message.pdf)
        void receiveJob(message as Required<typeof message>).catch(console.error);
    } catch (error) {
      console.error("[cloud] Message invalide", error);
    }
  });
  socket.on("close", () => {
    state = "DISCONNECTED";
    socket = undefined;
    scheduleReconnect();
  });
  socket.on("error", (error) => console.error("[cloud]", error.message));
}

export async function setConnectionMode(mode: "LOCAL" | "CLOUD") {
  await prisma.setting.upsert({
    where: { key: MODE_KEY },
    create: { key: MODE_KEY, value: mode },
    update: { value: mode },
  });
  if (mode === "CLOUD") {
    stopping = false;
    void connect();
  } else stopCloudConnection();
  return getCloudStatus();
}

export function startCloudConnection() {
  stopping = false;
  void connect();
}
export function stopCloudConnection() {
  stopping = true;
  state = "DISCONNECTED";
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = undefined;
  socket?.close();
  socket = undefined;
}
export async function getCloudStatus() {
  const mode = await getConnectionMode();
  const storeId = process.env.STORE_ID ?? "";
  const publicBase = (process.env.CLOUD_PUBLIC_URL ?? "https://print.bv-expedition.fr").replace(
    /\/$/,
    "",
  );
  return {
    mode,
    connection: state,
    connected: state === "CONNECTED",
    storeId,
    cloudUrl: storeId ? `${publicBase}/${encodeURIComponent(storeId)}` : null,
  };
}
