import { printQueue } from "./print.queue.js";
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

      const updatedJob: PrintJob = {
        ...job,
        status: "PRINTING",
      };

      void updatedJob;

      await delay(2000);

      const completedJob: PrintJob = {
        ...job,
        status: "PRINTED",
      };

      void completedJob;
    }
  }

  stop(): void {
    this.running = false;
  }
}

export const printWorker = new PrintWorker();
