import { existsSync } from "node:fs";
import {
  DEFAULT_PRINTER_NAME,
  type PrinterInfo,
  type PrintRequest,
  type PrintResult,
} from "./printer.types.js";
import { printWithWindowsCommand } from "./printer.windows.js";

const printMode = (process.env.PRINT_MODE ?? "simulation").toLowerCase();

export class PrinterService {
  async printPdf(request: PrintRequest): Promise<PrintResult> {
    const printerName = request.printerName?.trim() || DEFAULT_PRINTER_NAME;

    if (!request.filePath) {
      return { success: false, error: "File path is required." };
    }

    if (!existsSync(request.filePath)) {
      return { success: false, error: "File not found." };
    }

    if (printMode === "windows") {
      const result = await printWithWindowsCommand(request.filePath, printerName, request.copies);

      if (!result.success) {
        return {
          success: false,
          error: result.error ?? "Printing failed.",
        };
      }

      return {
        success: true,
        jobId: `windows-${Date.now()}`,
      };
    }

    return {
      success: true,
      jobId: `simulation-${Date.now()}`,
    };
  }

  listPrinters(): PrinterInfo[] {
    return [
      {
        name: DEFAULT_PRINTER_NAME,
        isDefault: true,
        isOnline: true,
      },
    ];
  }

  getDefaultPrinter(): PrinterInfo | null {
    return this.listPrinters()[0] ?? null;
  }

  findPrinterByName(name: string): PrinterInfo | null {
    const normalizedName = name.trim().toLowerCase();
    return (
      this.listPrinters().find((printer) => printer.name.trim().toLowerCase() === normalizedName) ??
      null
    );
  }

  validatePrinter(name: string): PrinterInfo | null {
    return this.findPrinterByName(name.trim() || DEFAULT_PRINTER_NAME);
  }
}

export const printerService = new PrinterService();
