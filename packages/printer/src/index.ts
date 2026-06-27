export {
  DEFAULT_PRINTER_NAME,
  type PrinterInfo,
  type PrintRequest,
  type PrintResult,
} from "./printer.types.js";
export { PrinterService, printerService } from "./printer.service.js";
export {
  findWindowsPrinterByName,
  getWindowsDefaultPrinter,
  listWindowsPrinters,
} from "./printer.windows.js";

export const printerPackage = {
  name: "@bv/printer",
  platformTarget: "win32",
} as const;

export type PrinterPackage = typeof printerPackage;
