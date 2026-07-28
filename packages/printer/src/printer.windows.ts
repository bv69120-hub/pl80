import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { DEFAULT_PRINTER_NAME, type PrinterInfo } from "./printer.types.js";
import { createThermalPrintPdf, rasterizeThermalPdf } from "./preparation/thermal.raster.js";

interface CommandResult {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  spawnError?: string;
}

interface WindowsPrintJob {
  JobIdentifier: number | string;
  JobStatus?: string;
  DocumentName?: string;
  SubmittedTime?: string;
  Size?: number;
}

interface PrintJobSnapshot {
  jobs: WindowsPrintJob[];
  commandResult: CommandResult;
}

interface PrintJobPollResult {
  snapshots: WindowsPrintJob[][];
  commandResult: CommandResult;
  durationMs: number;
}

const SPOOL_POLL_INTERVAL_MS = 250;
const SPOOL_POLL_DURATION_MS = 8_000;
const NO_WINDOWS_JOB_ERROR =
  "Sumatra a terminé sans erreur, mais aucun job Windows n’a été créé pour PL80E.";
const WINDOWS_JOB_FAILED_ERROR =
  "Un job Windows a été créé pour PL80E, mais le spooler signale un état d’erreur.";

type SumatraSource = "env" | "localAppData" | "programFiles" | "bundled";

interface ResolvedSumatra {
  path: string;
  source: SumatraSource;
  sha256: string;
  prefixArgs: string[];
}

export function listWindowsPrinters(): PrinterInfo[] {
  return [
    {
      name: process.env.DEFAULT_PRINTER_NAME?.trim() || DEFAULT_PRINTER_NAME,
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

function fileDiagnostic(filePath: string) {
  const exists = existsSync(filePath);
  return { path: filePath, exists, size: exists ? statSync(filePath).size : null };
}

function sha256(filePath: string) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex").toUpperCase();
}

function parseExplicitCommand(command: string) {
  const trimmed = command.trim();
  const quoted = trimmed.match(/^"([^"]+)"(?:\s+(.*))?$/);
  if (quoted) return { executable: quoted[1], args: quoted[2]?.split(/\s+/).filter(Boolean) ?? [] };
  if (existsSync(trimmed)) return { executable: trimmed, args: [] };
  const [executable = "", ...args] = trimmed.split(/\s+/);
  return { executable, args };
}

function validateBundledSumatra(executablePath: string) {
  const manifestPath = `${executablePath}.sha256`;
  if (!existsSync(executablePath) || !existsSync(manifestPath)) return false;
  const expectedHash = readFileSync(manifestPath, "utf8").trim().toUpperCase();
  const actualHash = sha256(executablePath);
  if (!expectedHash || expectedHash !== actualHash) return false;
  const localPath = pathFromEnvironment("LOCALAPPDATA", "SumatraPDF", "SumatraPDF.exe");
  return !localPath || !existsSync(localPath) || sha256(localPath) === actualHash;
}

function pathFromEnvironment(variable: string, ...parts: string[]) {
  const root = process.env[variable]?.trim();
  return root ? [root, ...parts].join("\\") : "";
}

function resolveSumatra(): ResolvedSumatra | null {
  const explicit = process.env.PRINT_COMMAND?.trim();
  if (explicit) {
    const parsed = parseExplicitCommand(explicit);
    if (parsed.executable && existsSync(parsed.executable)) {
      return {
        path: parsed.executable,
        source: "env",
        sha256: sha256(parsed.executable),
        prefixArgs: parsed.args,
      };
    }
  }
  const candidates: Array<{ path: string; source: Exclude<SumatraSource, "env"> }> = [
    {
      path: pathFromEnvironment("LOCALAPPDATA", "SumatraPDF", "SumatraPDF.exe"),
      source: "localAppData",
    },
    {
      path: pathFromEnvironment("ProgramFiles", "SumatraPDF", "SumatraPDF.exe"),
      source: "programFiles",
    },
    { path: process.env.SUMATRA_BUNDLED_PATH?.trim() ?? "", source: "bundled" },
  ];
  for (const candidate of candidates) {
    if (!candidate.path || !existsSync(candidate.path)) continue;
    if (candidate.source === "bundled" && !validateBundledSumatra(candidate.path)) continue;
    return {
      path: candidate.path,
      source: candidate.source,
      sha256: sha256(candidate.path),
      prefixArgs: [],
    };
  }
  return null;
}

function displayCommand(executable: string, args: string[]) {
  return [executable, ...args.map((argument) => JSON.stringify(argument))].join(" ");
}

async function runCommand(executable: string, args: string[]): Promise<CommandResult> {
  const command = displayCommand(executable, args);
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let spawnError: string | undefined;
    const child = spawn(executable, args, { shell: false, windowsHide: true });
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.once("error", (error) => {
      spawnError = error.stack ?? error.message;
    });
    child.once("close", (exitCode) =>
      resolve({ command, stdout: stdout.trim(), stderr: stderr.trim(), exitCode, spawnError }),
    );
  });
}

function diagnosticsText(diagnostics: Record<string, unknown>) {
  return Object.entries(diagnostics)
    .map(([key, value]) => `${key} = ${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join("\n");
}

async function getPrintJobs(printerName: string): Promise<PrintJobSnapshot> {
  const escapedPrinter = printerName.replaceAll("'", "''");
  const spoolerScript =
    `@(Get-PrintJob -PrinterName '${escapedPrinter}' -ErrorAction Stop | ` +
    "Select-Object @{Name='JobIdentifier';Expression={$_.ID}}," +
    "@{Name='JobStatus';Expression={$_.JobStatus.ToString()}},DocumentName,SubmittedTime,Size) | " +
    "ConvertTo-Json -Compress";
  const commandResult = await runCommand("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    spoolerScript,
  ]);
  let jobs: WindowsPrintJob[] = [];
  if (commandResult.exitCode === 0 && commandResult.stdout) {
    try {
      const parsed = JSON.parse(commandResult.stdout) as WindowsPrintJob | WindowsPrintJob[];
      jobs = Array.isArray(parsed) ? parsed : [parsed];
    } catch (error) {
      commandResult.spawnError = `Invalid Get-PrintJob JSON: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  return { jobs, commandResult };
}

async function pollPrintJobs(printerName: string): Promise<PrintJobPollResult> {
  const escapedPrinter = printerName.replaceAll("'", "''");
  const pollCount = Math.ceil(SPOOL_POLL_DURATION_MS / SPOOL_POLL_INTERVAL_MS);
  const spoolerScript =
    `$snapshots = 1..${pollCount} | ForEach-Object { ` +
    `Start-Sleep -Milliseconds ${SPOOL_POLL_INTERVAL_MS}; ` +
    `$jobs = @(Get-PrintJob -PrinterName '${escapedPrinter}' -ErrorAction Stop | ` +
    "Select-Object @{Name='JobIdentifier';Expression={$_.ID}}," +
    "@{Name='JobStatus';Expression={$_.JobStatus.ToString()}},DocumentName,SubmittedTime,Size); " +
    "ConvertTo-Json -InputObject $jobs -Compress }; $snapshots";
  const startedAt = Date.now();
  const commandResult = await runCommand("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    spoolerScript,
  ]);
  const snapshots: WindowsPrintJob[][] = [];
  if (commandResult.exitCode === 0) {
    for (const line of commandResult.stdout.split(/\r?\n/).filter(Boolean)) {
      try {
        const parsed = JSON.parse(line) as WindowsPrintJob | WindowsPrintJob[];
        snapshots.push(Array.isArray(parsed) ? parsed : [parsed]);
      } catch (error) {
        commandResult.spawnError = `Invalid Get-PrintJob poll JSON: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  }
  return { snapshots, commandResult, durationMs: Date.now() - startedAt };
}

function printJobChanged(before: WindowsPrintJob, after: WindowsPrintJob) {
  return (
    before.JobStatus !== after.JobStatus ||
    before.DocumentName !== after.DocumentName ||
    before.SubmittedTime !== after.SubmittedTime ||
    before.Size !== after.Size
  );
}

function detectsWindowsPrintActivity(before: WindowsPrintJob[], after: WindowsPrintJob[]) {
  if (after.length > before.length) return true;
  const beforeById = new Map(before.map((job) => [String(job.JobIdentifier), job]));
  return after.some((job) => {
    const previous = beforeById.get(String(job.JobIdentifier));
    return previous === undefined || printJobChanged(previous, job);
  });
}

function correlatedJobs(before: WindowsPrintJob[], after: WindowsPrintJob[]) {
  const beforeById = new Map(before.map((job) => [String(job.JobIdentifier), job]));
  return after.filter((job) => {
    const previous = beforeById.get(String(job.JobIdentifier));
    return previous === undefined || printJobChanged(previous, job);
  });
}

function spoolerReportsError(before: WindowsPrintJob[], snapshots: WindowsPrintJob[][]) {
  return snapshots
    .flatMap((snapshot) => correlatedJobs(before, snapshot))
    .some((job) =>
      String(job.JobStatus ?? "")
        .toLowerCase()
        .includes("error"),
    );
}

export async function printWithWindowsCommand(
  filePath: string,
  printerName: string,
  copies: number,
  originalFilePath?: string,
): Promise<{ success: boolean; error?: string }> {
  const configuredPrinter = process.env.DEFAULT_PRINTER_NAME?.trim() || DEFAULT_PRINTER_NAME;
  const pdf = fileDiagnostic(filePath);
  const sourcePdf = fileDiagnostic(originalFilePath ?? filePath);
  const sumatra = resolveSumatra();
  const baseDiagnostics: Record<string, unknown> = {
    PRINT_MODE: process.env.PRINT_MODE ?? "(unset)",
    DEFAULT_PRINTER_NAME: configuredPrinter,
    requestedPrinter: printerName,
    sourcePdf,
    preparedPdf: pdf,
    sumatraPath: sumatra?.path ?? "(not found)",
    sumatraSource: sumatra?.source ?? "(not found)",
    sumatraSha256: sumatra?.sha256 ?? "(not found)",
  };

  console.info(`[PRINT] ${diagnosticsText(baseDiagnostics)}`);

  if (process.platform !== "win32") {
    return {
      success: false,
      error: diagnosticsText({
        ...baseDiagnostics,
        failure: "Windows printing is only available on Windows.",
      }),
    };
  }
  if (!pdf.exists) {
    return {
      success: false,
      error: diagnosticsText({ ...baseDiagnostics, failure: "Prepared PDF was not found." }),
    };
  }
  if (!sumatra) {
    return {
      success: false,
      error: diagnosticsText({
        ...baseDiagnostics,
        failure: "No valid SumatraPDF executable was found.",
      }),
    };
  }

  let rasterPng;
  try {
    rasterPng = await rasterizeThermalPdf(filePath);
  } catch (error) {
    return {
      success: false,
      error: diagnosticsText({
        ...baseDiagnostics,
        rasterEngine: "pdfjs-dist 4.8.69 + node-canvas",
        failure: error instanceof Error ? (error.stack ?? error.message) : String(error),
      }),
    };
  }
  Object.assign(baseDiagnostics, {
    rasterPng: fileDiagnostic(rasterPng.path),
    rasterDimensions: `${rasterPng.width}x${rasterPng.height}`,
    rasterSize: rasterPng.size,
    rasterEngine: rasterPng.engine,
  });
  console.info(`[PRINT] thermal raster = ${diagnosticsText(baseDiagnostics)}`);

  let thermalPdf;
  try {
    thermalPdf = await createThermalPrintPdf(rasterPng);
  } catch (error) {
    return {
      success: false,
      error: diagnosticsText({
        ...baseDiagnostics,
        thermalPdfEngine: "pdf-lib 1.17.1",
        failure: error instanceof Error ? (error.stack ?? error.message) : String(error),
      }),
    };
  }
  Object.assign(baseDiagnostics, {
    thermalPdf: fileDiagnostic(thermalPdf.path),
    thermalPdfDimensionsMm: `${thermalPdf.widthMm}x${thermalPdf.heightMm}`,
    thermalPdfDimensionsPoints: `${thermalPdf.widthPoints}x${thermalPdf.heightPoints}`,
    thermalPdfSize: thermalPdf.size,
    thermalPdfEngine: thermalPdf.engine,
  });
  console.info(`[PRINT] thermal PDF = ${diagnosticsText(baseDiagnostics)}`);

  const jobsBefore = await getPrintJobs(printerName);
  console.info(`[PRINT] jobs before command = ${JSON.stringify(jobsBefore.jobs)}`);
  console.info(`[PRINT] jobs before stderr = ${jobsBefore.commandResult.stderr}`);
  console.info(`[PRINT] jobs before exitCode = ${String(jobsBefore.commandResult.exitCode)}`);

  const sumatraArgs = [
    ...sumatra.prefixArgs,
    "-silent",
    "-print-to",
    printerName,
    "-print-settings",
    `${copies}x`,
    thermalPdf.path,
  ];
  // PL80E jobs can be created and completed before Sumatra exits. Start the
  // required 250 ms spooler sampling concurrently so short-lived jobs are not
  // missed while still comparing every snapshot with the pre-print state.
  const jobsAfterPromise = pollPrintJobs(printerName);
  const sumatraResult = await runCommand(sumatra.path, sumatraArgs);
  console.info(`[PRINT] arguments = ${JSON.stringify(sumatraArgs)}`);
  console.info(`[PRINT] command = ${sumatraResult.command}`);
  console.info(`[PRINT] stdout = ${sumatraResult.stdout}`);
  console.info(`[PRINT] stderr = ${sumatraResult.stderr}`);
  console.info(`[PRINT] exitCode = ${String(sumatraResult.exitCode)}`);

  const jobsAfter = await jobsAfterPromise;
  const windowsJobDetected = jobsAfter.snapshots.some((snapshot) =>
    detectsWindowsPrintActivity(jobsBefore.jobs, snapshot),
  );
  const windowsJobError = spoolerReportsError(jobsBefore.jobs, jobsAfter.snapshots);
  console.info(`[PRINT] jobs after command = ${JSON.stringify(jobsAfter.snapshots)}`);
  console.info(`[PRINT] Get-PrintJob command = ${jobsAfter.commandResult.command}`);
  console.info(`[PRINT] Get-PrintJob stderr = ${jobsAfter.commandResult.stderr}`);
  console.info(`[PRINT] Get-PrintJob exitCode = ${String(jobsAfter.commandResult.exitCode)}`);
  console.info(`[PRINT] spool poll count = ${jobsAfter.snapshots.length}`);
  console.info(`[PRINT] spool poll duration ms = ${jobsAfter.durationMs}`);
  console.info(`[PRINT] Windows job detected = ${String(windowsJobDetected)}`);
  console.info(`[PRINT] Windows job error = ${String(windowsJobError)}`);

  const diagnostics = {
    ...baseDiagnostics,
    arguments: sumatraArgs,
    command: sumatraResult.command,
    stdout: sumatraResult.stdout,
    stderr: sumatraResult.stderr,
    exitCode: sumatraResult.exitCode,
    spawnError: sumatraResult.spawnError ?? "",
    jobsBefore: jobsBefore.jobs,
    jobsAfter: jobsAfter.snapshots,
    getPrintJobCommand: jobsAfter.commandResult.command,
    getPrintJobStderr: jobsAfter.commandResult.stderr,
    getPrintJobExitCode: jobsAfter.commandResult.exitCode,
    spoolPollCount: jobsAfter.snapshots.length,
    spoolPollDurationMs: jobsAfter.durationMs,
    windowsJobDetected,
    windowsJobError,
  };

  if (sumatraResult.exitCode !== 0 || sumatraResult.spawnError) {
    return {
      success: false,
      error: diagnosticsText({ ...diagnostics, failure: "SumatraPDF print command failed." }),
    };
  }

  if (!windowsJobDetected) {
    return {
      success: false,
      error: diagnosticsText({ failure: NO_WINDOWS_JOB_ERROR, ...diagnostics }),
    };
  }
  if (windowsJobError) {
    return {
      success: false,
      error: diagnosticsText({ failure: WINDOWS_JOB_FAILED_ERROR, ...diagnostics }),
    };
  }

  return { success: true };
}
