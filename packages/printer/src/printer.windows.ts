import { DEFAULT_PRINTER_NAME, type PrinterInfo } from "./printer.types.js";

export function listWindowsPrinters(): PrinterInfo[] {
  return [
    {
      name: DEFAULT_PRINTER_NAME,
      isDefault: true,
      isOnline: true,
    },
  ];
}

export function getWindowsDefaultPrinter(): PrinterInfo | null {
  return listWindowsPrinters()[0] ?? null;
}

export function findWindowsPrinterByName(name: string): PrinterInfo | null {
  const normalizedName = name.trim().toLowerCase();

  return (
    listWindowsPrinters().find((printer) => printer.name.trim().toLowerCase() === normalizedName) ??
    null
  );
}
