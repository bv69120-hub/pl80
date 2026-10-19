import { randomUUID } from "node:crypto";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { printerService, preparePdfForPrint } from "@bv/printer";
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { authenticate, requireRole } from "../auth/auth.middleware.js";

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_ACTIVE_TESTS = 5;
const TEST_TTL_MS = 30 * 60 * 1000;
const TARGET_WIDTH = (100 * 72) / 25.4;
const TARGET_HEIGHT = (150 * 72) / 25.4;
const TEST_CATEGORIES = new Set([
  "CHRONOPOST",
  "COLISSIMO",
  "MONDIAL_RELAY",
  "VINTED",
  "RELAIS_COLIS",
]);

interface PhysicalValidation {
  formatCorrect: boolean;
  noEssentialContentCut: boolean;
  orientationCorrect: boolean;
  textReadable: boolean;
  codeReadable: boolean;
  scannedWhenAvailable: boolean | null;
}

interface LabelTestRun {
  id: string;
  directory: string;
  originalPath: string;
  extractedPath: string;
  preparedPath: string;
  modelName: string;
  createdAt: string;
  expiresAt: number;
  physicalPrintRequested: boolean;
  physicalValidation?: PhysicalValidation;
}

function isPhysicalValidation(value: unknown): value is PhysicalValidation {
  if (typeof value !== "object" || value === null) return false;
  const validation = value as Record<string, unknown>;
  return (
    typeof validation.formatCorrect === "boolean" &&
    typeof validation.noEssentialContentCut === "boolean" &&
    typeof validation.orientationCorrect === "boolean" &&
    typeof validation.textReadable === "boolean" &&
    typeof validation.codeReadable === "boolean" &&
    (validation.scannedWhenAvailable === null ||
      typeof validation.scannedWhenAvailable === "boolean")
  );
}

const runs = new Map<string, LabelTestRun>();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fields: 2, fieldSize: 1024, fileSize: MAX_PDF_BYTES },
  fileFilter: (_request, file, callback) => callback(null, file.mimetype === "application/pdf"),
});

export const labelTestCenterRouter: Router = Router();
labelTestCenterRouter.use(authenticate, requireRole("ADMIN"));

function publicRun(run: LabelTestRun) {
  return {
    id: run.id,
    modelName: run.modelName,
    createdAt: run.createdAt,
    expiresAt: new Date(run.expiresAt).toISOString(),
    physicalPrintRequested: run.physicalPrintRequested,
    physicalValidation: run.physicalValidation,
  };
}

async function removeRun(run: LabelTestRun) {
  runs.delete(run.id);
  await rm(run.directory, { recursive: true, force: true });
  if (run.preparedPath !== run.originalPath && !run.preparedPath.startsWith(run.directory)) {
    await rm(run.preparedPath, { force: true });
  }
}

function findRun(request: Request, response: Response) {
  const runId = request.params.runId;
  const run = runs.get(typeof runId === "string" ? runId : (runId?.[0] ?? ""));
  if (!run || run.expiresAt <= Date.now()) {
    if (run) {
      void removeRun(run).catch((error: unknown) => {
        console.error("Expired label test cleanup failed.", error);
      });
    }
    response.status(404).json({ message: "Cette analyse a expiré. Importez à nouveau le PDF." });
    return undefined;
  }
  return run;
}

function uploadMiddleware(request: Request, response: Response, next: (error?: unknown) => void) {
  upload.single("file")(request, response, (error: unknown) => {
    if (!error) {
      next();
      return;
    }
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      response.status(413).json({ message: "Le PDF ne doit pas dépasser 10 Mo." });
      return;
    }
    if (error instanceof multer.MulterError) {
      response.status(400).json({ message: "Un seul fichier PDF peut être analysé à la fois." });
      return;
    }
    next(error);
  });
}

labelTestCenterRouter.post("/analyze", uploadMiddleware, async (request, response) => {
  for (const run of runs.values()) {
    if (run.expiresAt <= Date.now()) await removeRun(run);
  }
  if (runs.size >= MAX_ACTIVE_TESTS) {
    response.status(429).json({ message: "Trop d’analyses sont en cours. Réessayez plus tard." });
    return;
  }
  if (!request.file) {
    response.status(400).json({ message: "Sélectionnez un fichier PDF." });
    return;
  }
  if (request.file.buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    response.status(415).json({ message: "Le fichier transmis n’est pas un PDF valide." });
    return;
  }
  const modelValue = request.body.modelName;
  const modelName =
    typeof modelValue === "string" && modelValue.trim().length > 0 && modelValue.length <= 80
      ? modelValue.trim()
      : "Modèle non renseigné";
  if (
    [...modelName].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  ) {
    response.status(400).json({ message: "Le nom du modèle contient des caractères invalides." });
    return;
  }
  const selectedCategory = request.body.selectedCategory;
  if (typeof selectedCategory !== "string" || !TEST_CATEGORIES.has(selectedCategory)) {
    response.status(400).json({ message: "Sélectionnez une catégorie de transporteur reconnue." });
    return;
  }

  const id = randomUUID();
  const directory = await mkdtemp(path.join(os.tmpdir(), "bv-label-test-"));
  const originalPath = path.join(directory, "original.pdf");
  const preparedPath = path.join(directory, "prepared.pdf");
  let temporaryPreparedPath: string | undefined;
  try {
    await writeFile(originalPath, request.file.buffer);
    const preparation = await preparePdfForPrint(originalPath, { diagnosticsDirectory: directory });
    temporaryPreparedPath = preparation.preparedPath;
    await copyFile(preparation.preparedPath, preparedPath);
    if (preparation.preparedPath !== originalPath) {
      await rm(preparation.preparedPath, { force: true });
      temporaryPreparedPath = undefined;
    }
    if (!preparation.diagnostics?.extractedPath) {
      throw new Error(
        "The preparation engine did not produce the requested extracted-region preview.",
      );
    }

    const run: LabelTestRun = {
      id,
      directory,
      originalPath,
      extractedPath: preparation.diagnostics.extractedPath,
      preparedPath,
      modelName,
      createdAt: new Date().toISOString(),
      expiresAt: Date.now() + TEST_TTL_MS,
      physicalPrintRequested: false,
    };
    runs.set(id, run);
    const outputWidth = preparation.diagnostics.targetWidth;
    const outputHeight = preparation.diagnostics.targetHeight;
    const dimensionsMatch =
      Math.abs(outputWidth - TARGET_WIDTH) < 0.25 && Math.abs(outputHeight - TARGET_HEIGHT) < 0.25;
    const warnings = [...preparation.diagnostics.warnings];
    if (!dimensionsMatch) warnings.push("The prepared PDF is not 100 × 150 mm.");
    if (!preparation.diagnostics.proportionsPreserved) {
      warnings.push("The prepared PDF may be distorted; check it visually.");
    }
    if (preparation.adaptation === "UNSUPPORTED") {
      warnings.push("No compatible extraction strategy was selected.");
    }

    response.status(201).json({
      ...publicRun(run),
      selectedCategory,
      carrier: preparation.carrier,
      sourceFormat: preparation.format,
      sourceDimensions: {
        widthPoints: preparation.diagnostics.sourceWidth,
        heightPoints: preparation.diagnostics.sourceHeight,
        pageCount: preparation.diagnostics.pageCount,
        orientation:
          preparation.diagnostics.sourceWidth > preparation.diagnostics.sourceHeight
            ? "landscape"
            : "portrait",
      },
      extractedRegion: preparation.diagnostics.extractedRegion,
      preparedDimensions: { widthPoints: outputWidth, heightPoints: outputHeight },
      strategy: preparation.diagnostics.strategy,
      adaptation: preparation.adaptation,
      proportionsPreserved: preparation.diagnostics.proportionsPreserved,
      checks: {
        validPdf: true,
        targetDimensions: dimensionsMatch,
        proportionsPreserved: preparation.diagnostics.proportionsPreserved,
        physicalPrint: "NOT_TESTED",
      },
      warnings,
      previews: {
        original: `/api/label-tests/${id}/original`,
        extracted: `/api/label-tests/${id}/extracted`,
        prepared: `/api/label-tests/${id}/prepared`,
      },
    });
  } catch (error) {
    console.error(
      "Label test PDF analysis failed.",
      error instanceof Error ? error.name : "Unknown error",
    );
    if (temporaryPreparedPath && temporaryPreparedPath !== originalPath) {
      await rm(temporaryPreparedPath, { force: true }).catch((cleanupError: unknown) => {
        console.error("Temporary label preparation cleanup failed.", cleanupError);
      });
    }
    await rm(directory, { recursive: true, force: true }).catch((cleanupError: unknown) => {
      console.error("Temporary label test cleanup failed.", cleanupError);
    });
    response.status(422).json({
      message: "Le PDF ne peut pas être analysé ou préparé par le moteur d’impression.",
    });
  }
});

labelTestCenterRouter.get("/:runId/:view", async (request, response) => {
  const run = findRun(request, response);
  if (!run) return;
  const view = request.params.view;
  const file =
    view === "original"
      ? run.originalPath
      : view === "extracted"
        ? run.extractedPath
        : view === "prepared"
          ? run.preparedPath
          : undefined;
  if (!file) {
    response.status(404).json({ message: "Aperçu inconnu." });
    return;
  }
  response.set("Cache-Control", "no-store, private");
  response.type("application/pdf").send(await readFile(file));
});

labelTestCenterRouter.post("/:runId/print", async (request, response) => {
  const run = findRun(request, response);
  if (!run) return;
  if (request.body?.confirmed !== true) {
    response
      .status(400)
      .json({ message: "Confirmez explicitement l’envoi d’une seule étiquette test." });
    return;
  }
  if (run.physicalPrintRequested) {
    response
      .status(409)
      .json({ message: "Une impression a déjà été demandée pour cette analyse." });
    return;
  }
  run.physicalPrintRequested = true;
  let result;
  try {
    result = await printerService.printPdf({
      filePath: run.preparedPath,
      originalFilePath: run.originalPath,
      printerName: "PL80E",
      copies: 1,
    });
  } catch (error) {
    console.error("Authorized label test print request failed.", error);
    response.status(503).json({ message: "La demande d’impression a échoué." });
    return;
  }
  if (!result.success) {
    response.status(503).json({
      message: result.error ?? "La demande d’impression n’a pas pu être transmise.",
    });
    return;
  }
  response.status(202).json({
    status: result.status ?? "SUBMITTED",
    message: "Demande envoyée une fois. Vérifiez physiquement l’étiquette sur la PL80E.",
  });
});

labelTestCenterRouter.post("/:runId/physical-validation", async (request, response) => {
  const run = findRun(request, response);
  if (!run) return;
  if (!run.physicalPrintRequested) {
    response.status(409).json({ message: "Aucun test physique n’a été lancé pour cette analyse." });
    return;
  }
  const validation: unknown = request.body?.validation;
  if (!isPhysicalValidation(validation)) {
    response.status(400).json({ message: "Renseignez tous les critères de contrôle physique." });
    return;
  }
  run.physicalValidation = validation;
  response.json({
    status: Object.values(validation).every((value) => value === true || value === null)
      ? "PHYSICALLY_VALIDATED"
      : "PHYSICALLY_NON_COMPLIANT",
    physicalValidation: run.physicalValidation,
  });
});

labelTestCenterRouter.delete("/:runId", async (request, response) => {
  const run = findRun(request, response);
  if (!run) return;
  await removeRun(run);
  response.status(204).end();
});

const expirySweep = setInterval(() => {
  const now = Date.now();
  for (const run of runs.values()) {
    if (run.expiresAt <= now) {
      void removeRun(run).catch((error: unknown) => {
        console.error("Expired label test cleanup failed.", error);
      });
    }
  }
}, 60_000);
expirySweep.unref();
