export const DEFAULT_PRINTER_NAME = "PL80E";

export type PrintJobStatus = "PENDING" | "PRINTING" | "PRINTED" | "FAILED";

export interface PrintJob {
  id: string;
  filePath: string;
  printerName: string;
  copies: number;
  status: PrintJobStatus;
  createdAt: string;
}

export interface PrintQueueSummary {
  pending: PrintJob[];
  inProgress: PrintJob[];
  completed: PrintJob[];
}
