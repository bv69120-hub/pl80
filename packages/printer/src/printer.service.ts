import {
  DEFAULT_PRINTER_NAME,
  type PrinterInfo,
  type PrintRequest,
  type PrintResult,
} from "./printer.types.js";
import {
  findWindowsPrinterByName,
  getWindowsDefaultPrinter,
  listWindowsPrinters,
} from "./printer.windows.js";

export class PrinterService {
  listPrinters(): PrinterInfo[] {
    return listWindowsPrinters();
  }

  getDefaultPrinter(): PrinterInfo | null {
    return getWindowsDefaultPrinter();
  }

  findPrinterByName(name: string): PrinterInfo | null {
    return findWindowsPrinterByName(name);
  }

  validatePrinter(name: string): PrinterInfo | null {
    const printerName = name.trim() || DEFAULT_PRINTER_NAME;
    return this.findPrinterByName(printerName);
  }

  print(request: PrintRequest): PrintResult {
    const printer = this.validatePrinter(request.printerName);

    if (!printer) {
      return {
        success: false,
        error: `Printer "${request.printerName}" was not found.`,
      };
    }

    if (request.copies < 1) {
      return {
        success: false,
        error: "Copies must be greater than zero.",
      };
    }

    return {
      success: true,
      jobId: `simulated-${printer.name}-${Date.now()}`,
    };
  }
}

export const printerService = new PrinterService();
