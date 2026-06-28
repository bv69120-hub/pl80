export type PdfFormat = "A4" | "A5" | "A6" | "100x150" | "UNKNOWN";

export type Carrier =
  | "VINTED"
  | "MONDIAL_RELAY"
  | "CHRONOPOST"
  | "COLISSIMO"
  | "UPS"
  | "DHL"
  | "GLS"
  | "DPD"
  | "UNKNOWN";

export type AdaptationKind = "NONE" | "LABEL_EXTRACTED" | "RESIZED" | "UNSUPPORTED";

export interface PdfPreparationResult {
  originalPath: string;
  preparedPath: string;
  carrier: Carrier;
  format: PdfFormat;
  adaptation: AdaptationKind;
  adapted: boolean;
  compatiblePL80E: boolean;
}

export interface TextPosition {
  text: string;
  x: number;
  y: number;
}

export interface PdfAnalysisContext {
  text: string;
  textPositions: TextPosition[];
  width: number;
  height: number;
}

export interface CarrierStrategy {
  carrier: Exclude<Carrier, "UNKNOWN">;
  keywords: readonly string[];
}
