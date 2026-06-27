import { Router } from "express";
import { authenticate } from "../auth/auth.middleware.js";
import { printQueue } from "@bv/printer";
import type { PrintJob } from "@bv/printer";

export const printJobsRouter: Router = Router();

printJobsRouter.get("/status", authenticate, (_request, response) => {
  const jobs = printQueue.getJobs() as PrintJob[];

  response.json({
    pending: jobs.filter((job: PrintJob) => job.status === "PENDING"),
    inProgress: jobs.filter((job: PrintJob) => job.status === "PRINTING"),
    completed: jobs.filter((job: PrintJob) => job.status === "PRINTED"),
  });
});
