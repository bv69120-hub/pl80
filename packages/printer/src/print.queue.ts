import type { PrintJob } from "./printer.types.js";

export class PrintQueue {
  private jobs: PrintJob[] = [];

  enqueue(job: PrintJob): PrintJob {
    this.jobs.push(job);
    return job;
  }

  dequeue(): PrintJob | null {
    return this.jobs.shift() ?? null;
  }

  clear(): void {
    this.jobs = [];
  }

  getJobs(): PrintJob[] {
    return [...this.jobs];
  }
}

export const printQueue = new PrintQueue();
