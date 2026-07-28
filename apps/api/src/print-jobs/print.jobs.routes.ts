import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir } from "node:fs/promises";
import { Router } from "express";
import multer from "multer";
import { prisma } from "@bv/database";
import { preparePdfForPrint, printQueue } from "@bv/printer";
import type { PdfPreparationResult, PrintJob, PrintJobStatus } from "@bv/printer";
import type { AuthenticatedRequest } from "../auth/auth.middleware.js";
import { authenticate } from "../auth/auth.middleware.js";

const upload = multer({
  dest: path.join(os.tmpdir(), "bv-expedition-pro"),
  limits: { files: 1, fileSize: 10 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    const isPdf =
      file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf");
    if (isPdf) callback(null, true);
    else callback(new Error("PDF_ONLY"));
  },
});

export const printJobsRouter: Router = Router();

const printHistoryDirectory =
  process.env.PRINT_HISTORY_DIR ?? path.resolve(process.cwd(), "data", "print-history");

export async function prepareUploadedPdf(file: Express.Multer.File) {
  const preparation = await preparePdfForPrint(file.path);
  await mkdir(printHistoryDirectory, { recursive: true });
  const originalFilePath = path.join(printHistoryDirectory, `${randomUUID()}.pdf`);
  await copyFile(file.path, originalFilePath);
  return { preparation, originalFilePath };
}

export function preparationData(preparation: PdfPreparationResult, originalFilePath: string) {
  return {
    originalFilePath,
    preparedFilePath: preparation.preparedPath,
    detectedCarrier: preparation.carrier,
    detectedFormat: preparation.format,
    adaptation: preparation.adaptation,
    adapted: preparation.adapted,
    pl80eCompatible: preparation.compatiblePL80E,
  };
}

function enqueuePrintJob(job: {
  id: string;
  filename: string;
  filePath: string;
  originalFilePath?: string;
  source: "CLIENT" | "EMPLOYEE";
  copies?: number;
}) {
  const queueJob: PrintJob = {
    id: job.id,
    filePath: job.filePath,
    originalFilePath: job.originalFilePath,
    printerName: "PL80E",
    copies: job.copies ?? 1,
    status: "PENDING",
    source: job.source,
    createdAt: new Date().toISOString(),
    onStatusChange: async (status: PrintJobStatus, errorMessage?: string) => {
      await prisma.printJob.update({
        where: { id: job.id },
        data: { status, errorMessage: status === "FAILED" ? errorMessage : null },
      });
    },
  };
  printQueue.enqueue(queueJob);
}

printJobsRouter.post("/", authenticate, upload.single("file"), async (request, response, next) => {
  try {
    const auth = (request as AuthenticatedRequest).auth;
    if (!request.file || !auth) {
      response.status(400).json({ message: "Un fichier PDF est requis." });
      return;
    }
    const copies = Math.max(1, Math.min(99, Number(request.body.copies) || 1));
    const { preparation, originalFilePath } = await prepareUploadedPdf(request.file);
    const job = await prisma.printJob.create({
      data: {
        filename: request.file.originalname,
        status: "PENDING",
        source: "EMPLOYEE",
        printerName: "PL80E",
        copies,
        userId: auth.id,
        ...preparationData(preparation, originalFilePath),
      },
    });
    enqueuePrintJob({
      id: job.id,
      filename: job.filename,
      filePath: preparation.preparedPath,
      originalFilePath,
      source: "EMPLOYEE",
      copies,
    });
    response.status(201).json({ job, preparation });
  } catch (error) {
    next(error);
  }
});

printJobsRouter.get("/:id/preparation", authenticate, async (request, response, next) => {
  try {
    const jobId = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
    const job = await prisma.printJob.findUnique({
      where: { id: jobId },
      select: {
        detectedCarrier: true,
        detectedFormat: true,
        adaptation: true,
        adapted: true,
        pl80eCompatible: true,
      },
    });
    if (!job) {
      response.status(404).json({ message: "Impression introuvable." });
      return;
    }
    response.json({
      carrier: job.detectedCarrier,
      format: job.detectedFormat,
      adaptation: job.adaptation,
      adapted: job.adapted,
      compatiblePL80E: job.pl80eCompatible,
    });
  } catch (error) {
    next(error);
  }
});

printJobsRouter.get("/", authenticate, async (_request, response, next) => {
  try {
    const jobs = await prisma.printJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { username: true } } },
    });
    response.json({ jobs });
  } catch (error) {
    next(error);
  }
});

printJobsRouter.get("/status", authenticate, (_request, response) => {
  const jobs = printQueue.getJobs();
  response.json({
    pending: jobs.filter((job) => job.status === "PENDING"),
    inProgress: jobs.filter((job) => job.status === "PRINTING"),
    completed: jobs.filter((job) => job.status === "PRINTED"),
  });
});

export { enqueuePrintJob, upload };
