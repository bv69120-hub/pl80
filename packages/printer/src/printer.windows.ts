import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
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

function quoteForShell(value: string) {
  return `"${value.replace(/"/g, '\\"')}"`;
}

export async function printWithWindowsCommand(
  filePath: string,
  printerName: string,
  copies: number,
): Promise<{ success: boolean; error?: string }> {
  if (!existsSync(filePath)) {
    return { success: false, error: "File not found." };
  }

  const printer = findWindowsPrinterByName(printerName);

  if (!printer) {
    return { success: false, error: `Printer "${printerName}" was not found.` };
  }

  if (process.platform !== "win32") {
    return { success: false, error: "Windows printing is only available on Windows." };
  }

  const command = process.env.PRINT_COMMAND?.trim();
  const printerArgument = command ? printerName : DEFAULT_PRINTER_NAME;

  try {
    if (command) {
      const [executable, ...args] = command.split(/\s+/);
      const child = spawn(
        executable,
        [...args, filePath, `--printer=${printerArgument}`, `--copies=${copies}`],
        {
          shell: false,
          stdio: "ignore",
        },
      );

      const exitCode = await new Promise<number>((resolve, reject) => {
        child.once("error", reject);
        child.once("close", resolve);
      });

      if (exitCode !== 0) {
        return { success: false, error: "Print command failed." };
      }

      return { success: true };
    }

    const shellCommand = [
      "Start-Process",
      "-FilePath",
      quoteForShell(filePath),
      "-Verb",
      "PrintTo",
      "-ArgumentList",
      quoteForShell(printerArgument),
    ].join(" ");

    const child = spawn("powershell", ["-NoProfile", "-Command", shellCommand], {
      stdio: "ignore",
    });

    const exitCode = await new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });

    if (exitCode !== 0) {
      return { success: false, error: "Printing failed." };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Printing failed.",
    };
  }
}
