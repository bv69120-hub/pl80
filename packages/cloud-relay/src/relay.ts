import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { Server, IncomingMessage } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express } from "express";
import helmet from "helmet";
import multer from "multer";
import { WebSocketServer, WebSocket, type RawData } from "ws";

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const JOB_TTL_MS = 15 * 60 * 1000;
const UPLOAD_TOKEN_TTL_MS = 5 * 60 * 1000;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_PER_IP = 10;
const RATE_LIMIT_PER_STORE = 20;
const webDistDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../apps/web/dist",
);

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

interface RateBucket {
  count: number;
  resetsAt: number;
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
  const uploadTokens = new Map<string, number>();
  const rateBuckets = new Map<string, RateBucket>();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { files: 1, fileSize: MAX_PDF_BYTES },
    fileFilter: (_request, file, done) => done(null, file.mimetype === "application/pdf"),
  });

  app.set("trust proxy", 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.urlencoded({ extended: false }));
  app.use(express.static(webDistDirectory, { dotfiles: "deny", fallthrough: true, index: false }));
  app.get("/health", (_request, response) =>
    response.json({ name: "BV Cloud Relay", status: "ok" }),
  );

  function token(storeId: string, expiresAt: number, nonce: string) {
    const payload = `${storeId}.${expiresAt}.${nonce}`;
    const signature = createHmac("sha256", options.sessionSecret).update(payload).digest("hex");
    return `${expiresAt}.${nonce}.${signature}`;
  }
  function validToken(storeId: string, candidate: string) {
    const [expiresRaw = "", nonce = ""] = candidate.split(".");
    const expiresAt = Number(expiresRaw);
    return (
      Number.isFinite(expiresAt) &&
      expiresAt > Date.now() &&
      uploadTokens.get(candidate) === expiresAt &&
      safeEqual(token(storeId, expiresAt, nonce), candidate)
    );
  }
  function issueToken(storeId: string) {
    const expiresAt = Date.now() + UPLOAD_TOKEN_TTL_MS;
    const candidate = token(storeId, expiresAt, randomBytes(16).toString("hex"));
    uploadTokens.set(candidate, expiresAt);
    return candidate;
  }
  function errorPage(title: string, message: string) {
    return `<!doctype html><html lang="fr"><meta name="viewport" content="width=device-width"><title>${title}</title><body style="font:18px system-ui;background:#f3f6fa;color:#123;display:grid;place-items:center;min-height:100vh;margin:0"><main style="background:white;padding:2rem;border-radius:16px;max-width:460px"><h1>${title}</h1><p>${message}</p></main></body></html>`;
  }
  function clientError(
    request: express.Request,
    response: express.Response,
    status: number,
    message: string,
  ) {
    if (wantsJson(request)) {
      response.status(status).json({ message });
      return;
    }
    response.status(status).type("html").send(errorPage("Envoi impossible", message));
  }
  function wantsJson(request: express.Request) {
    return (
      request
        .get("accept")
        ?.split(",")
        .some((acceptedType) => acceptedType.trim().split(";")[0] === "application/json") ?? false
    );
  }
  function rateAllowed(key: string, maximum: number) {
    const now = Date.now();
    const bucket = rateBuckets.get(key);
    if (!bucket || bucket.resetsAt <= now) {
      rateBuckets.set(key, { count: 1, resetsAt: now + RATE_WINDOW_MS });
      return true;
    }
    bucket.count += 1;
    return bucket.count <= maximum;
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

  app.get("/:storeId", async (request, response, next) => {
    const storeId = Array.isArray(request.params.storeId)
      ? (request.params.storeId[0] ?? "")
      : request.params.storeId;
    if (!options.stores[storeId])
      return void response
        .status(404)
        .type("html")
        .send(errorPage("Magasin inconnu", "Vérifiez le lien ou contactez le magasin."));
    if (sockets.get(storeId)?.readyState !== WebSocket.OPEN)
      return void response
        .status(503)
        .type("html")
        .send(
          errorPage(
            "Magasin hors ligne",
            "L’impression est temporairement indisponible. Réessayez dans quelques instants.",
          ),
        );
    const uploadToken = issueToken(storeId);
    try {
      const indexHtml = await readFile(path.join(webDistDirectory, "index.html"), "utf8");
      const bootstrap = `<script>window.bvCloudPortal=${JSON.stringify({
        storeId,
        uploadToken,
      }).replaceAll("<", "\\u003c")};</script>`;
      response
        .set("Cache-Control", "no-store, private")
        .type("html")
        .send(indexHtml.replace("</head>", `${bootstrap}</head>`));
    } catch (error) {
      uploadTokens.delete(uploadToken);
      next(error);
    }
  });
  app.post(
    "/api/jobs/:storeId",
    (request, response, next) => {
      const storeId = Array.isArray(request.params.storeId)
        ? (request.params.storeId[0] ?? "")
        : request.params.storeId;
      if (
        !rateAllowed(`ip:${request.ip}`, RATE_LIMIT_PER_IP) ||
        !rateAllowed(`store:${storeId}`, RATE_LIMIT_PER_STORE)
      ) {
        clientError(
          request,
          response,
          429,
          "Trop de demandes. Veuillez patienter une minute avant de réessayer.",
        );
        return;
      }
      next();
    },
    upload.single("file"),
    (request, response) => {
      const storeId = Array.isArray(request.params.storeId)
        ? (request.params.storeId[0] ?? "")
        : request.params.storeId;
      if (!options.stores[storeId] || !validToken(storeId, String(request.body.token ?? ""))) {
        clientError(
          request,
          response,
          401,
          "Cette session a expiré. Rechargez le QR code et sélectionnez à nouveau votre PDF.",
        );
        return;
      }
      uploadTokens.delete(String(request.body.token ?? ""));
      if (sockets.get(storeId)?.readyState !== WebSocket.OPEN) {
        clientError(
          request,
          response,
          503,
          "Le magasin est hors ligne. Le PDF n’a pas été conservé.",
        );
        return;
      }
      if (!request.file) {
        clientError(request, response, 400, "Un fichier PDF est requis.");
        return;
      }
      if (request.file.buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
        clientError(request, response, 415, "Le fichier transmis n’est pas un PDF valide.");
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
      if (wantsJson(request)) {
        response.status(202).json({ id: job.id, status: "PENDING" });
      } else {
        response
          .status(202)
          .send(
            "<!doctype html><html lang=fr><meta name=viewport content='width=device-width'><body style='font:18px system-ui;text-align:center;padding:3rem'><h1>PDF envoyé ✓</h1><p>Le magasin a reçu votre demande.</p></body></html>",
          );
      }
    },
  );
  app.use(
    (
      error: unknown,
      request: express.Request,
      response: express.Response,
      next: express.NextFunction,
    ) => {
      if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
        clientError(
          request,
          response,
          413,
          "PDF trop volumineux. La taille maximale autorisée est de 10 Mo.",
        );
        return;
      }
      next(error);
    },
  );

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
        request.headers["x-forwarded-proto"]?.toString().split(",")[0]?.trim() === "https" ||
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
    for (const [candidate, expiresAt] of uploadTokens)
      if (expiresAt <= now) uploadTokens.delete(candidate);
    for (const [key, bucket] of rateBuckets) if (bucket.resetsAt <= now) rateBuckets.delete(key);
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
