export const DEFAULT_PRINTER_NAME = "PL80E";

export type PrintJobStatus = "PENDING" | "PRINTING" | "SUBMITTED" | "SPOOLER_OBSERVED" | "FAILED";

export type PrintCompletionStatus = "SUBMITTED" | "SPOOLER_OBSERVED";

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
  submitted: PrintJob[];
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
  status?: PrintCompletionStatus;
  error?: string;
}
