import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { Server, IncomingMessage } from "node:http";
import express, { type Express } from "express";
import helmet from "helmet";
import multer from "multer";
import { WebSocketServer, WebSocket, type RawData } from "ws";

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const JOB_TTL_MS = 15 * 60 * 1000;

interface StoredJob {
  id: string;
  storeId: string;
  filename: string;
  pdf: Buffer;
  expiresAt: number;
}

export interface RelayOptions {
  stores: Record<string, string>;
  sessionSecret: string;
  allowInsecureLocal?: boolean;
}

export interface RelayServer {
  app: Express;
  attach(server: Server): void;
  close(): void;
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createRelayServer(options: RelayOptions): RelayServer {
  const app = express();
  const sockets = new Map<string, WebSocket>();
  const jobs = new Map<string, StoredJob>();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { files: 1, fileSize: MAX_PDF_BYTES },
    fileFilter: (_request, file, done) =>
      done(
        null,
        file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf"),
      ),
  });

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.urlencoded({ extended: false }));
  app.get("/health", (_request, response) =>
    response.json({ status: "ok", storesConnected: sockets.size }),
  );

  function token(storeId: string, expiresAt: number) {
    const payload = `${storeId}.${expiresAt}`;
    const signature = createHmac("sha256", options.sessionSecret).update(payload).digest("hex");
    return `${expiresAt}.${signature}`;
  }
  function validToken(storeId: string, candidate: string) {
    const [expiresRaw] = candidate.split(".");
    const expiresAt = Number(expiresRaw);
    return (
      Number.isFinite(expiresAt) &&
      expiresAt > Date.now() &&
      safeEqual(token(storeId, expiresAt), candidate)
    );
  }
  function push(job: StoredJob) {
    const socket = sockets.get(job.storeId);
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(
      JSON.stringify({
        type: "job",
        id: job.id,
        filename: job.filename,
        pdf: job.pdf.toString("base64"),
      }),
    );
  }

  app.get("/:storeId", (request, response) => {
    const storeId = Array.isArray(request.params.storeId)
      ? (request.params.storeId[0] ?? "")
      : request.params.storeId;
    if (!options.stores[storeId]) return void response.status(404).send("Magasin inconnu");
    const uploadToken = token(storeId, Date.now() + 5 * 60 * 1000);
    response
      .type("html")
      .send(
        `<!doctype html><html lang="fr"><meta name="viewport" content="width=device-width"><title>BV Expédition</title><style>body{font:16px system-ui;background:#f3f6fa;color:#123;display:grid;place-items:center;min-height:100vh;margin:0}main{background:white;padding:2rem;border-radius:16px;max-width:460px;box-shadow:0 8px 30px #1232}button{background:#ffd400;border:0;padding:1rem;width:100%;font-weight:800;border-radius:8px}input{margin:1.5rem 0;width:100%}</style><main><h1>Imprimez votre bordereau</h1><p>PDF uniquement, 10 Mo maximum.</p><form method="post" action="/api/jobs/${encodeURIComponent(storeId)}" enctype="multipart/form-data"><input type="hidden" name="token" value="${uploadToken}"><input required type="file" name="file" accept="application/pdf"><button>Envoyer à l’imprimante</button></form></main></html>`,
      );
  });
  app.post("/api/jobs/:storeId", upload.single("file"), (request, response) => {
    const storeId = Array.isArray(request.params.storeId)
      ? (request.params.storeId[0] ?? "")
      : request.params.storeId;
    if (!options.stores[storeId] || !validToken(storeId, String(request.body.token ?? ""))) {
      response.status(401).send("Session invalide ou expirée.");
      return;
    }
    if (!request.file) {
      response.status(400).send("Un PDF est requis.");
      return;
    }
    const job: StoredJob = {
      id: randomUUID(),
      storeId,
      filename: request.file.originalname,
      pdf: request.file.buffer,
      expiresAt: Date.now() + JOB_TTL_MS,
    };
    jobs.set(job.id, job);
    push(job);
    response
      .status(202)
      .send(
        "<!doctype html><html lang=fr><meta name=viewport content='width=device-width'><body style='font:18px system-ui;text-align:center;padding:3rem'><h1>PDF envoyé ✓</h1><p>Le magasin a reçu votre demande.</p></body></html>",
      );
  });

  const ws = new WebSocketServer({ noServer: true });
  ws.on("connection", (socket: WebSocket, request: IncomingMessage) => {
    const storeId =
      new URL(request.url ?? "/", "http://relay.local").searchParams.get("storeId") ?? "";
    const previous = sockets.get(storeId);
    previous?.close(4001, "Connexion remplacée");
    sockets.set(storeId, socket);
    for (const job of jobs.values()) if (job.storeId === storeId) push(job);
    socket.on("message", (raw: RawData) => {
      try {
        const message = JSON.parse(raw.toString()) as { type?: string; id?: string };
        if (message.type === "ack" && message.id && jobs.get(message.id)?.storeId === storeId)
          jobs.delete(message.id);
      } catch {
        socket.close(1003, "Message invalide");
      }
    });
    socket.on("close", () => {
      if (sockets.get(storeId) === socket) sockets.delete(storeId);
    });
    void request;
  });

  function attach(server: Server) {
    server.on("upgrade", (request, socket, head) => {
      const url = new URL(request.url ?? "/", "http://relay.local");
      const storeId = url.searchParams.get("storeId") ?? "";
      const secret = request.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
      const secure =
        ("encrypted" in request.socket && request.socket.encrypted === true) ||
        options.allowInsecureLocal;
      if (
        url.pathname !== "/ws" ||
        !secure ||
        !options.stores[storeId] ||
        !safeEqual(options.stores[storeId], secret)
      ) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      ws.handleUpgrade(request, socket, head, (client) => ws.emit("connection", client, request));
    });
  }
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [id, job] of jobs) if (job.expiresAt <= now) jobs.delete(id);
  }, 30_000);
  cleanup.unref();
  return {
    app,
    attach,
    close: () => {
      clearInterval(cleanup);
      ws.close();
    },
  };
}

export function generateSecret() {
  return randomBytes(32).toString("hex");
}
