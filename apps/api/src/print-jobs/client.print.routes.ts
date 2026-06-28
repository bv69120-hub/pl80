import { Router } from "express";
import { prisma } from "@bv/database";
import { enqueuePrintJob, upload } from "./print.jobs.routes.js";
import { isClientTokenValid } from "../settings/client.mode.service.js";

const CLIENT_DELAY_MS = 10_000;
let lastClientPrintAt = 0;
let requestInProgress = false;

export const clientPrintRouter: Router = Router();

function routeToken(value: string | string[]) {
  return Array.isArray(value) ? (value[0] ?? "") : value;
}

clientPrintRouter.get("/:token/status", async (request, response, next) => {
  try {
    const available = await isClientTokenValid(routeToken(request.params.token));
    response.status(available ? 200 : 403).json({ available });
  } catch (error) {
    next(error);
  }
});

clientPrintRouter.post("/:token", upload.single("file"), async (request, response, next) => {
  if (requestInProgress) {
    response.status(409).json({ message: "Une demande client est déjà en cours." });
    return;
  }
  requestInProgress = true;
  try {
    if (!(await isClientTokenValid(routeToken(request.params.token)))) {
      response
        .status(403)
        .json({ message: "Le service d'impression client est momentanément indisponible." });
      return;
    }
    if (!request.file) {
      response.status(400).json({ message: "Un fichier PDF est requis." });
      return;
    }
    const elapsed = Date.now() - lastClientPrintAt;
    if (elapsed < CLIENT_DELAY_MS) {
      response.status(429).json({
        message: `Veuillez patienter ${Math.ceil((CLIENT_DELAY_MS - elapsed) / 1000)} seconde(s).`,
      });
      return;
    }
    const activeJob = await prisma.printJob.findFirst({
      where: { source: "CLIENT", status: { in: ["PENDING", "PRINTING"] } },
    });
    if (activeJob) {
      response.status(409).json({ message: "Une impression client est déjà en cours." });
      return;
    }
    const job = await prisma.printJob.create({
      data: {
        filename: request.file.originalname,
        status: "PENDING",
        source: "CLIENT",
        printerName: "PL80E",
        copies: 1,
      },
    });
    lastClientPrintAt = Date.now();
    enqueuePrintJob({
      id: job.id,
      filename: job.filename,
      filePath: request.file.path,
      source: "CLIENT",
    });
    response.status(201).json({ id: job.id, status: job.status, source: job.source });
  } catch (error) {
    next(error);
  } finally {
    requestInProgress = false;
  }
});
