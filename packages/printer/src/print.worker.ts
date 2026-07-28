import { printQueue } from "./print.queue.js";
import { printerService } from "./printer.service.js";
import type { PrintJob } from "./printer.types.js";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class PrintWorker {
  private running = false;

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;

    while (this.running) {
      const job = printQueue.dequeue();

      if (!job) {
        await delay(100);
        continue;
      }

      const processingJob: PrintJob = {
        ...job,
        status: "PRINTING",
      };
      await job.onStatusChange?.(processingJob.status);

      let result;
      try {
        result = await printerService.printPdf({
          filePath: job.filePath,
          originalFilePath: job.originalFilePath,
          printerName: job.printerName,
          copies: job.copies,
        });
      } catch (error) {
        result = {
          success: false,
          error: error instanceof Error ? (error.stack ?? error.message) : String(error),
        };
      }

      if (result.success) {
        const completedJob: PrintJob = {
          ...job,
          status: "PRINTED",
        };

        await job.onStatusChange?.(completedJob.status);
      } else {
        const failedJob: PrintJob = {
          ...job,
          status: "FAILED",
        };

        await job.onStatusChange?.(failedJob.status, result.error ?? "Unknown printing error.");
      }
    }
  }

  stop(): void {
    this.running = false;
  }
}

export const printWorker = new PrintWorker();
