import type { Carrier, CarrierStrategy, PdfAnalysisContext } from "./preparation.types.js";

// Adding a carrier only requires one entry here; preparation itself remains carrier-agnostic.
export const carrierStrategies: readonly CarrierStrategy[] = [
  { carrier: "VINTED", keywords: ["VINTED"] },
  { carrier: "MONDIAL_RELAY", keywords: ["MONDIAL RELAY", "MONDIALRELAY"] },
  { carrier: "CHRONOPOST", keywords: ["CHRONOPOST", "CHRONO 13", "CHRONO 18"] },
  { carrier: "COLISSIMO", keywords: ["COLISSIMO", "LA POSTE"] },
  { carrier: "UPS", keywords: ["UPS", "UNITED PARCEL SERVICE"] },
  { carrier: "DHL", keywords: ["DHL"] },
  { carrier: "GLS", keywords: ["GLS", "GENERAL LOGISTICS SYSTEMS"] },
  { carrier: "DPD", keywords: ["DPD"] },
];

export function normalizePdfText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function detectCarrier(context: PdfAnalysisContext): Carrier {
  const normalizedText = normalizePdfText(context.text);
  return (
    carrierStrategies.find((strategy) =>
      strategy.keywords.some((keyword) => normalizedText.includes(keyword)),
    )?.carrier ?? "UNKNOWN"
  );
}
