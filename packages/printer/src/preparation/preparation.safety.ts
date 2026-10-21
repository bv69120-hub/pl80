import type { PdfPreparationResult } from "./preparation.types.js";

export function requiresManualReview(preparation: PdfPreparationResult) {
  return (
    !preparation.compatiblePL80E ||
    preparation.adaptation === "UNSUPPORTED" ||
    (preparation.strategy === "GENERIC_A4_CROP" && preparation.carrier !== "CHRONOPOST")
  );
}
