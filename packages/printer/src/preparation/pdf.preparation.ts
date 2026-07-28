import os from "node:os";
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { PDFDocument } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { detectCarrier, normalizePdfText } from "./carrier.strategies.js";
import type {
  PdfAnalysisContext,
  PdfFormat,
  PdfPreparationResult,
  TextPosition,
} from "./preparation.types.js";

const POINTS_PER_MM = 72 / 25.4;
const TARGET_WIDTH = 100 * POINTS_PER_MM;
const TARGET_HEIGHT = 150 * POINTS_PER_MM;
const require = createRequire(import.meta.url);
const standardFontDataUrl = `${path.join(path.dirname(require.resolve("pdfjs-dist/package.json")), "standard_fonts")}${path.sep}`;

function closeTo(actual: number, expected: number, tolerance = 4) {
  return Math.abs(actual - expected) <= tolerance;
}

export function detectPdfFormat(widthPoints: number, heightPoints: number): PdfFormat {
  const width = Math.min(widthPoints, heightPoints) / POINTS_PER_MM;
  const height = Math.max(widthPoints, heightPoints) / POINTS_PER_MM;

  if (closeTo(width, 100) && closeTo(height, 150)) return "100x150";
  if (closeTo(width, 210) && closeTo(height, 297)) return "A4";
  if (closeTo(width, 148) && closeTo(height, 210)) return "A5";
  if (closeTo(width, 105) && closeTo(height, 148)) return "A6";
  return "UNKNOWN";
}

async function analyzePdf(bytes: Uint8Array): Promise<PdfAnalysisContext> {
  // pdf.js may transfer and detach its input buffer when using a worker.
  // Keep the original bytes available for pdf-lib's preparation pass.
  const loadingTask = getDocument({
    data: bytes.slice(),
    standardFontDataUrl,
    useSystemFonts: true,
    disableFontFace: false,
  });
  const document = await loadingTask.promise;
  try {
    const page = await document.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const textPositions: TextPosition[] = content.items.flatMap((item) => {
      if (!("str" in item) || !item.str.trim()) return [];
      return [{ text: item.str, x: item.transform[4], y: item.transform[5] }];
    });
    return {
      text: textPositions.map((item) => item.text).join(" "),
      textPositions,
      width: viewport.width,
      height: viewport.height,
    };
  } finally {
    await document.destroy();
  }
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function findCarrierAnchor(context: PdfAnalysisContext) {
  const carrier = detectCarrier(context);
  if (carrier === "UNKNOWN") return undefined;
  const words = carrier.replaceAll("_", " ").split(" ");
  return context.textPositions.find((position) => {
    const text = normalizePdfText(position.text);
    return words.some((word) => text.includes(word));
  });
}

async function createLabelPdf(source: PDFDocument, context: PdfAnalysisContext, cropA4: boolean) {
  const output = await PDFDocument.create();
  const sourcePage = source.getPage(0);
  const { width, height } = sourcePage.getSize();
  let embedded;

  if (cropA4) {
    const anchor = findCarrierAnchor(context);
    const landscape = width > height;
    const cropWidth = landscape ? TARGET_WIDTH + 56 : TARGET_WIDTH;
    const cropHeight = landscape ? TARGET_HEIGHT + 56 : TARGET_HEIGHT;
    const left = landscape
      ? clamp(
          anchor
            ? anchor.x > width / 2
              ? anchor.x - 24
              : anchor.x - cropWidth + 24
            : width - cropWidth,
          0,
          width - cropWidth,
        )
      : clamp((anchor?.x ?? width / 2) - TARGET_WIDTH / 2, 0, width - TARGET_WIDTH);
    const bottom = landscape
      ? clamp(
          anchor
            ? anchor.y > height / 2
              ? anchor.y - cropHeight + 28
              : anchor.y - 28
            : height - cropHeight,
          0,
          height - cropHeight,
        )
      : clamp(
          anchor ? anchor.y - TARGET_HEIGHT + 35 : height - TARGET_HEIGHT,
          0,
          height - TARGET_HEIGHT,
        );
    embedded = await output.embedPage(sourcePage, {
      left,
      bottom,
      right: left + cropWidth,
      top: bottom + cropHeight,
    });
  } else {
    embedded = await output.embedPage(sourcePage);
  }

  const page = output.addPage([TARGET_WIDTH, TARGET_HEIGHT]);
  const scale = Math.min(TARGET_WIDTH / embedded.width, TARGET_HEIGHT / embedded.height);
  const drawnWidth = embedded.width * scale;
  const drawnHeight = embedded.height * scale;
  page.drawPage(embedded, {
    x: (TARGET_WIDTH - drawnWidth) / 2,
    y: (TARGET_HEIGHT - drawnHeight) / 2,
    width: drawnWidth,
    height: drawnHeight,
  });
  return output.save();
}

export async function preparePdfForPrint(filePath: string): Promise<PdfPreparationResult> {
  const input = new Uint8Array(await readFile(filePath));
  const context = await analyzePdf(input);
  const format = detectPdfFormat(context.width, context.height);
  const carrier = detectCarrier(context);

  if (format === "100x150") {
    return {
      originalPath: filePath,
      preparedPath: filePath,
      carrier,
      format,
      adaptation: "NONE",
      adapted: false,
      compatiblePL80E: true,
    };
  }

  if (format === "UNKNOWN") {
    return {
      originalPath: filePath,
      preparedPath: filePath,
      carrier,
      format,
      adaptation: "UNSUPPORTED",
      adapted: false,
      compatiblePL80E: false,
    };
  }

  const source = await PDFDocument.load(input);
  const preparedBytes = await createLabelPdf(source, context, format === "A4");
  const preparedPath = path.join(os.tmpdir(), `bv-pl80e-${randomUUID()}.pdf`);
  await writeFile(preparedPath, preparedBytes);

  return {
    originalPath: filePath,
    preparedPath,
    carrier,
    format,
    adaptation: format === "A4" ? "LABEL_EXTRACTED" : "RESIZED",
    adapted: true,
    compatiblePL80E: true,
  };
}
