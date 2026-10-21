import { Router } from "express";
import { prisma } from "@bv/database";
import { authenticate } from "../auth/auth.middleware.js";

const carriers = new Set(["CHRONOPOST", "COLISSIMO", "MONDIAL_RELAY", "VINTED", "RELAIS_COLIS"]);
const labelTypes = new Set(["CLASSIC", "SHOP2SHOP", "VINTED_GO", "A4_MULTI_PANEL", "OTHER"]);
const cropResults = new Set(["CORRECT", "INCORRECT", "UNCERTAIN"]);
const issueTypes = new Set([
  "NONE",
  "LABEL_CUT",
  "BARCODE_CUT",
  "WRONG_ORIENTATION",
  "WRONG_SCALE",
  "TOO_SMALL",
  "MISSING_INFORMATION",
  "WRONG_REGION",
  "OTHER",
]);
const printResults = new Set(["SUCCESS", "FAILED", "NOT_PRINTED"]);
const allowedFields = new Set([
  "carrier",
  "labelType",
  "cropResult",
  "issueType",
  "printResult",
  "physicalVerified",
]);

export const incidentsRouter: Router = Router();
incidentsRouter.use(authenticate);

incidentsRouter.get("/", async (_request, response, next) => {
  try {
    const incidents = await prisma.carrierIncident.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    response.json({ incidents });
  } catch (error) {
    next(error);
  }
});

incidentsRouter.post("/", async (request, response) => {
  const input: unknown = request.body;
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    response.status(400).json({ message: "Les informations de l’incident sont invalides." });
    return;
  }

  const values = input as Record<string, unknown>;
  if (Object.keys(values).some((key) => !allowedFields.has(key))) {
    response.status(400).json({
      message:
        "Seules les catégories prédéfinies sont acceptées. N’ajoutez aucune donnée personnelle.",
    });
    return;
  }

  if (
    typeof values.carrier !== "string" ||
    !carriers.has(values.carrier) ||
    typeof values.labelType !== "string" ||
    !labelTypes.has(values.labelType) ||
    typeof values.cropResult !== "string" ||
    !cropResults.has(values.cropResult) ||
    typeof values.issueType !== "string" ||
    !issueTypes.has(values.issueType) ||
    typeof values.printResult !== "string" ||
    !printResults.has(values.printResult) ||
    typeof values.physicalVerified !== "boolean"
  ) {
    response.status(400).json({ message: "Sélectionnez une valeur valide pour chaque champ." });
    return;
  }

  try {
    const incident = await prisma.carrierIncident.create({
      data: {
        carrier: values.carrier,
        labelType: values.labelType,
        cropResult: values.cropResult,
        issueType: values.issueType,
        printResult: values.printResult,
        physicalVerified: values.physicalVerified,
      },
    });
    response.status(201).json({ incident });
  } catch (error) {
    response.status(500).json({ message: "Impossible d’enregistrer l’incident." });
    console.error(
      "[incidents] Failed to save carrier incident.",
      error instanceof Error ? error.name : "UnknownError",
    );
  }
});
