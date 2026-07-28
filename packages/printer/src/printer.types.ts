export const DEFAULT_PRINTER_NAME = "PL80E";

export type PrintJobStatus = "PENDING" | "PRINTING" | "PRINTED" | "FAILED";

export interface PrintJob {
  id: string;
  filePath: string;
  originalFilePath?: string;
  printerName: string;
  copies: number;
  status: PrintJobStatus;
  createdAt: string;
  source?: "CLIENT" | "EMPLOYEE";
  onStatusChange?: (status: PrintJobStatus, errorMessage?: string) => void | Promise<void>;
}

export interface PrintQueueSummary {
  pending: PrintJob[];
  inProgress: PrintJob[];
  completed: PrintJob[];
}

export interface PrinterInfo {
  name: string;
  isDefault: boolean;
  isOnline: boolean;
}

export interface PrintRequest {
  filePath: string;
  originalFilePath?: string;
  printerName: string;
  copies: number;
}

export interface PrintResult {
  success: boolean;
  jobId?: string;
  error?: string;
}
