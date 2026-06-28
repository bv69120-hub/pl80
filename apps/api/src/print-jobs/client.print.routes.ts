import { Router } from "express";
import { prisma } from "@bv/database";
import { enqueuePrintJob, upload } from "./print.jobs.routes.js";

const CLIENT_DELAY_MS = 10_000;
let lastClientPrintAt = 0;
let requestInProgress = false;

export const clientPrintRouter: Router = Router();

clientPrintRouter.post("/", upload.single("file"), async (request, response, next) => {
  if (requestInProgress) {
    response.status(409).json({ message: "Une demande client est déjà en cours." });
    return;
  }
  requestInProgress = true;
  try {
    if (!request.file) {
      response.status(400).json({ message: "Un fichier PDF est requis." });
      return;
    }
    const elapsed = Date.now() - lastClientPrintAt;
    if (elapsed < CLIENT_DELAY_MS) {
      response
        .status(429)
        .json({
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
