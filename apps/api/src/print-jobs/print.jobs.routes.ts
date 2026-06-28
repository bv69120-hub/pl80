import os from "node:os";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { prisma } from "@bv/database";
import { printQueue } from "@bv/printer";
import type { PrintJob, PrintJobStatus } from "@bv/printer";
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

function enqueuePrintJob(job: {
  id: string;
  filename: string;
  filePath: string;
  source: "CLIENT" | "EMPLOYEE";
  copies?: number;
}) {
  const queueJob: PrintJob = {
    id: job.id,
    filePath: job.filePath,
    printerName: "PL80E",
    copies: job.copies ?? 1,
    status: "PENDING",
    source: job.source,
    createdAt: new Date().toISOString(),
    onStatusChange: async (status: PrintJobStatus) => {
      await prisma.printJob.update({ where: { id: job.id }, data: { status } });
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
    const job = await prisma.printJob.create({
      data: {
        filename: request.file.originalname,
        status: "PENDING",
        source: "EMPLOYEE",
        printerName: "PL80E",
        copies,
        userId: auth.id,
      },
    });
    enqueuePrintJob({
      id: job.id,
      filename: job.filename,
      filePath: request.file.path,
      source: "EMPLOYEE",
      copies,
    });
    response.status(201).json(job);
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
