export {
  DEFAULT_PRINTER_NAME,
  type PrintJob,
  type PrintJobStatus,
  type PrintQueueSummary,
  type PrinterInfo,
  type PrintRequest,
  type PrintResult,
} from "./printer.types.js";
export { PrintQueue, printQueue } from "./print.queue.js";
export { PrintWorker, printWorker } from "./print.worker.js";
export { PrinterService, printerService } from "./printer.service.js";
export { printWithWindowsCommand } from "./printer.windows.js";

export const printerPackage = {
  name: "@bv/printer",
  platformTarget: "win32",
} as const;

export type PrinterPackage = typeof printerPackage;
