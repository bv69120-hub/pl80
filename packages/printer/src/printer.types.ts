export const DEFAULT_PRINTER_NAME = "PL80E";

export interface PrinterInfo {
  name: string;
  isDefault: boolean;
  isOnline: boolean;
}

export interface PrintRequest {
  filePath: string;
  printerName: string;
  copies: number;
}

export interface PrintResult {
  success: boolean;
  jobId?: string;
  error?: string;
}
