export const printerPackage = {
  name: "@bv/printer",
  platformTarget: "win32",
} as const;

export type PrinterPackage = typeof printerPackage;
