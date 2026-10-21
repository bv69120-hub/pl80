import os from "node:os";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { createCanvas } from "canvas";
import { degrees, PDFDocument } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { detectCarrier, normalizePdfText } from "./carrier.strategies.js";
import type {
  PdfAnalysisContext,
  PdfFormat,
  PdfPreparationDiagnostics,
  PdfPreparationResult,
  TextPosition,
} from "./preparation.types.js";

const POINTS_PER_MM = 72 / 25.4;
const TARGET_WIDTH = 100 * POINTS_PER_MM;
const TARGET_HEIGHT = 150 * POINTS_PER_MM;
const COLISSIMO_IMAGE_WIDTH = 1200;
const CHRONOPOST_SHOP2SHOP_CROP = { left: 18, bottom: 8, right: 535, top: 340 } as const;
const VINTED_MONDIAL_RELAY_RENDER_WIDTH = 720;
const VINTED_MONDIAL_RELAY_PRINT_MARGIN = 2 * POINTS_PER_MM;
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
      rotation: page.rotate,
      pageCount: document.numPages,
    };
  } finally {
    await document.destroy();
  }
}

interface PdfRegion {
  left: number;
  bottom: number;
  right: number;
  top: number;
}

export interface PdfPreparationOptions {
  diagnosticsDirectory?: string;
}

async function addDiagnostics(
  result: PdfPreparationResult,
  input: Uint8Array,
  context: PdfAnalysisContext,
  strategy: string,
  region: PdfRegion,
  diagnosticsDirectory?: string,
): Promise<PdfPreparationResult> {
  const warnings: string[] = [];
  if (context.pageCount > 1) {
    warnings.push("Only the first page is prepared; review the remaining source pages manually.");
  }
  if (!result.compatiblePL80E) {
    warnings.push("The preparation engine did not adapt this document to the thermal format.");
  }
  if (result.adaptation === "LABEL_EXTRACTED") {
    warnings.push(
      "Confirm visually that no required label content lies outside the extracted region.",
    );
  }

  let extractedPath: string | undefined;
  if (diagnosticsDirectory) {
    await mkdir(diagnosticsDirectory, { recursive: true });
    const source = await PDFDocument.load(input);
    const page = source.getPage(0);
    const extracted = await PDFDocument.create();
    const embedded = await extracted.embedPage(page, region);
    const extractedPage = extracted.addPage([embedded.width, embedded.height]);
    extractedPage.drawPage(embedded, { x: 0, y: 0 });
    extractedPath = path.join(diagnosticsDirectory, "extracted.pdf");
    await writeFile(extractedPath, await extracted.save());
  }

  const prepared = await PDFDocument.load(await readFile(result.preparedPath));
  const preparedPage = prepared.getPage(0);
  const diagnostics: PdfPreparationDiagnostics = {
    pageCount: context.pageCount,
    sourceWidth: context.width,
    sourceHeight: context.height,
    sourceRotation: context.rotation,
    strategy,
    extractedRegion: region,
    ...(extractedPath ? { extractedPath } : {}),
    targetWidth: preparedPage.getWidth(),
    targetHeight: preparedPage.getHeight(),
    proportionsPreserved: true,
    warnings,
  };
  return { ...result, diagnostics };
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

export function detectColissimoSplit(context: PdfAnalysisContext): number | undefined {
  if (detectCarrier(context) !== "COLISSIMO" || context.width <= context.height * 1.12) {
    return undefined;
  }

  const normalizedPositions = context.textPositions.map((position) => ({
    ...position,
    normalizedText: normalizePdfText(position.text),
  }));
  const leftCarrierAnchor = normalizedPositions.some(
    (position) =>
      position.x < context.width * 0.65 &&
      (position.normalizedText.includes("COLISSIMO") ||
        position.normalizedText.includes("LA POSTE")),
  );
  const rightPanelText = normalizedPositions
    .filter((position) => position.x >= context.width * 0.35)
    .map((position) => position.normalizedText)
    .join(" ");
  const receiptHeading =
    /(?:PREUVE|JUSTIFICATIF|BORDEREAU|RECU).{0,24}DEPOT|DEPOT.{0,24}(?:PREUVE|JUSTIFICATIF|BORDEREAU|RECU)/;
  const hasDepositProof = receiptHeading.test(rightPanelText);

  if (!leftCarrierAnchor || !hasDepositProof) return undefined;

  const xPositions = [...new Set(normalizedPositions.map((position) => position.x))]
    .filter((x) => Number.isFinite(x) && x > 0 && x < context.width)
    .sort((left, right) => left - right);
  let splitX: number | undefined;
  let widestGap = Math.max(24, context.width * 0.05);

  for (let index = 1; index < xPositions.length; index += 1) {
    const gap = xPositions[index] - xPositions[index - 1];
    const candidateSplit = (xPositions[index] + xPositions[index - 1]) / 2;
    if (
      gap > widestGap &&
      candidateSplit >= context.width * 0.3 &&
      candidateSplit <= context.width * 0.7
    ) {
      widestGap = gap;
      splitX = candidateSplit;
    }
  }

  if (splitX === undefined) return undefined;

  const leftAnchorIsLeft = normalizedPositions.some(
    (position) =>
      position.x < splitX &&
      (position.normalizedText.includes("COLISSIMO") ||
        position.normalizedText.includes("LA POSTE")),
  );
  const proofIsRight = normalizedPositions.some(
    (position) =>
      position.x > splitX &&
      /PREUVE|JUSTIFICATIF|BORDEREAU|RECU|DEPOT/.test(position.normalizedText),
  );

  return leftAnchorIsLeft && proofIsRight ? splitX : undefined;
}

export function detectChronopostShop2ShopLabel(context: PdfAnalysisContext) {
  if (
    context.rotation !== 0 ||
    Math.abs(context.width - 595) > 3 ||
    Math.abs(context.height - 842) > 3
  ) {
    return undefined;
  }

  const positions = context.textPositions.map((position) => ({
    ...position,
    normalizedText: normalizePdfText(position.text),
  }));
  const hasShop2ShopHeading = positions.some(
    (position) =>
      position.y > context.height * 0.82 &&
      position.x < context.width * 0.3 &&
      position.normalizedText.includes("SHOP2SHOP"),
  );
  const hasChronopostServiceReference = positions.some(
    (position) =>
      position.y > context.height * 0.25 &&
      position.y < context.height * 0.45 &&
      position.x > context.width * 0.25 &&
      position.x < context.width * 0.55 &&
      /^FR[- ]?CHR[- ]\d{3,}/.test(position.normalizedText),
  );
  const hasRotatedTrackingNumber = positions.some(
    (position) =>
      position.y > context.height * 0.25 &&
      position.y < context.height * 0.45 &&
      position.x > context.width * 0.35 &&
      position.x < context.width * 0.6 &&
      /^XW[A-Z0-9]{8,}$/.test(position.normalizedText),
  );

  return hasShop2ShopHeading && hasChronopostServiceReference && hasRotatedTrackingNumber
    ? CHRONOPOST_SHOP2SHOP_CROP
    : undefined;
}

function findVerticalBorder(
  isDark: (x: number, y: number) => boolean,
  imageWidth: number,
  imageHeight: number,
  startX: number,
  endX: number,
) {
  const startY = Math.round(imageHeight * 0.08);
  const endY = Math.round(imageHeight * 0.92);
  let bestX = -1;
  let bestCoverage = 0;

  for (let x = Math.round(imageWidth * startX); x < Math.round(imageWidth * endX); x += 1) {
    let coveredRows = 0;
    for (let y = startY; y < endY; y += 1) {
      if (
        isDark(Math.max(0, x - 1), y) ||
        isDark(x, y) ||
        isDark(Math.min(imageWidth - 1, x + 1), y)
      ) {
        coveredRows += 1;
      }
    }
    if (coveredRows > bestCoverage) {
      bestX = x;
      bestCoverage = coveredRows;
    }
  }

  return {
    x: bestX,
    coverage: bestCoverage / (endY - startY),
  };
}

function findHorizontalBorder(
  isDark: (x: number, y: number) => boolean,
  imageWidth: number,
  imageHeight: number,
  startX: number,
  endX: number,
  startY: number,
  endY: number,
) {
  const firstX = Math.round(imageWidth * startX);
  const lastX = Math.round(imageWidth * endX);
  let bestCoverage = 0;

  for (let y = Math.round(imageHeight * startY); y < Math.round(imageHeight * endY); y += 1) {
    let coveredColumns = 0;
    for (let x = firstX; x < lastX; x += 1) {
      if (
        isDark(x, Math.max(0, y - 1)) ||
        isDark(x, y) ||
        isDark(x, Math.min(imageHeight - 1, y + 1))
      ) {
        coveredColumns += 1;
      }
    }
    bestCoverage = Math.max(bestCoverage, coveredColumns / (lastX - firstX));
  }

  return bestCoverage;
}

async function detectColissimoImageSplit(
  bytes: Uint8Array,
  context: PdfAnalysisContext,
): Promise<number | undefined> {
  // This narrow page-size gate targets the known Colissimo two-panel export only.
  if (
    context.rotation !== 0 ||
    context.width <= context.height ||
    Math.abs(context.width - 670.26) > 10 ||
    Math.abs(context.height - 472.84) > 8
  ) {
    return undefined;
  }

  const loadingTask = getDocument({
    data: bytes.slice(),
    standardFontDataUrl,
    useSystemFonts: true,
    disableFontFace: false,
  });
  const document = await loadingTask.promise;
  try {
    if (document.numPages !== 1) return undefined;

    const page = await document.getPage(1);
    if (page.rotate !== 0) return undefined;
    const scale = COLISSIMO_IMAGE_WIDTH / context.width;
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const canvasContext = canvas.getContext("2d");
    canvasContext.fillStyle = "#ffffff";
    canvasContext.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({
      canvasContext: canvasContext as never,
      viewport,
      background: "rgb(255,255,255)",
    }).promise;

    const { data, width, height } = canvasContext.getImageData(0, 0, canvas.width, canvas.height);
    const isDark = (x: number, y: number) => {
      const offset = (y * width + x) * 4;
      return data[offset] < 160 && data[offset + 1] < 160 && data[offset + 2] < 160;
    };

    const leftOuterBorder = findVerticalBorder(isDark, width, height, 0.01, 0.04);
    const leftPanelBorder = findVerticalBorder(isDark, width, height, 0.44, 0.49);
    const rightPanelBorder = findVerticalBorder(isDark, width, height, 0.51, 0.55);
    const rightOuterBorder = findVerticalBorder(isDark, width, height, 0.95, 0.99);
    const hasPanelOutlines =
      leftOuterBorder.coverage > 0.65 &&
      leftPanelBorder.coverage > 0.65 &&
      rightPanelBorder.coverage > 0.65 &&
      rightOuterBorder.coverage > 0.65 &&
      findHorizontalBorder(isDark, width, height, 0.04, 0.45, 0.04, 0.08) > 0.55 &&
      findHorizontalBorder(isDark, width, height, 0.04, 0.45, 0.92, 0.96) > 0.55 &&
      findHorizontalBorder(isDark, width, height, 0.55, 0.95, 0.04, 0.08) > 0.55 &&
      findHorizontalBorder(isDark, width, height, 0.55, 0.95, 0.92, 0.96) > 0.55;
    if (!hasPanelOutlines || leftPanelBorder.x < 0) return undefined;

    const gutterWidth = Math.max(2, Math.round(width * 0.008));
    let clearestGutter = 1;
    for (let x = Math.round(width * 0.48); x <= Math.round(width * 0.51) - gutterWidth; x += 1) {
      let darkPixels = 0;
      for (let y = Math.round(height * 0.08); y < Math.round(height * 0.92); y += 1) {
        for (let gutterX = x; gutterX < x + gutterWidth; gutterX += 1) {
          if (isDark(gutterX, y)) darkPixels += 1;
        }
      }
      clearestGutter = Math.min(clearestGutter, darkPixels / (gutterWidth * height * 0.84));
    }
    if (clearestGutter > 0.2) return undefined;

    let barcodeRows = 0;
    for (let y = Math.round(height * 0.57); y < Math.round(height * 0.76); y += 2) {
      let transitions = 0;
      let wasDark = isDark(Math.round(width * 0.08), y);
      for (let x = Math.round(width * 0.08) + 1; x < Math.round(width * 0.42); x += 1) {
        const dark = isDark(x, y);
        if (dark !== wasDark) transitions += 1;
        wasDark = dark;
      }
      if (transitions >= 32) barcodeRows += 1;
    }
    if (barcodeRows < 8) return undefined;

    const splitPixel = Math.min(
      Math.round(width * 0.495),
      leftPanelBorder.x + Math.max(6, Math.round(width * 0.012)),
    );
    return (splitPixel / width) * context.width;
  } finally {
    await document.destroy();
  }
}

function findHorizontalSeparator(
  isDark: (x: number, y: number) => boolean,
  imageWidth: number,
  imageHeight: number,
) {
  const firstX = Math.round(imageWidth * 0.025);
  const lastX = Math.round(imageWidth * 0.975);
  const firstY = Math.round(imageHeight * 0.4);
  const lastY = Math.round(imageHeight * 0.65);
  let bestY = -1;
  let bestCoverage = 0;

  for (let y = firstY; y < lastY; y += 1) {
    let coveredColumns = 0;
    for (let x = firstX; x < lastX; x += 1) {
      if (
        isDark(x, Math.max(0, y - 1)) ||
        isDark(x, y) ||
        isDark(x, Math.min(imageHeight - 1, y + 1))
      ) {
        coveredColumns += 1;
      }
    }
    const coverage = coveredColumns / (lastX - firstX);
    if (coverage > bestCoverage) {
      bestY = y;
      bestCoverage = coverage;
    }
  }

  return { y: bestY, coverage: bestCoverage };
}

export async function detectVintedMondialRelayTopLabel(
  bytes: Uint8Array,
  context: PdfAnalysisContext,
): Promise<number | undefined> {
  if (
    context.rotation !== 0 ||
    context.width >= context.height ||
    Math.abs(context.width - 595) > 3 ||
    Math.abs(context.height - 842) > 3
  ) {
    return undefined;
  }

  const carrier = detectCarrier(context);
  if (carrier !== "VINTED" && carrier !== "MONDIAL_RELAY") return undefined;

  const positions = context.textPositions.map((position) => ({
    ...position,
    normalizedText: normalizePdfText(position.text),
  }));
  const senderOnLeft = positions.some(
    (position) =>
      position.x < context.width * 0.52 &&
      position.y > context.height * 0.55 &&
      /EXPEDITEUR|ENVOYEUR|SENDER/.test(position.normalizedText),
  );
  const recipientOnRight = positions.some(
    (position) =>
      position.x > context.width * 0.45 &&
      position.y > context.height * 0.55 &&
      /DESTINATAIRE|POINT.?RELAIS|LIVRAISON/.test(position.normalizedText),
  );
  const separateLowerRecipientSheet = positions.some(
    (position) =>
      position.y > context.height * 0.08 &&
      position.y < context.height * 0.48 &&
      /FICHE.{0,20}DESTINATAIRE|DESTINATAIRE.{0,20}FICHE/.test(position.normalizedText),
  );
  if (!senderOnLeft || !recipientOnRight || !separateLowerRecipientSheet) return undefined;

  const loadingTask = getDocument({
    data: bytes.slice(),
    standardFontDataUrl,
    useSystemFonts: true,
    disableFontFace: false,
  });
  const document = await loadingTask.promise;
  try {
    if (document.numPages !== 1) return undefined;

    const page = await document.getPage(1);
    if (page.rotate !== 0) return undefined;
    const scale = VINTED_MONDIAL_RELAY_RENDER_WIDTH / context.width;
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const canvasContext = canvas.getContext("2d");
    canvasContext.fillStyle = "#ffffff";
    canvasContext.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({
      canvasContext: canvasContext as never,
      viewport,
      background: "rgb(255,255,255)",
    }).promise;

    const { data, width, height } = canvasContext.getImageData(0, 0, canvas.width, canvas.height);
    const isDark = (x: number, y: number) => {
      const offset = (y * width + x) * 4;
      return data[offset] < 160 && data[offset + 1] < 160 && data[offset + 2] < 160;
    };
    const separator = findHorizontalSeparator(isDark, width, height);
    if (separator.y < 0 || separator.coverage < 0.72) return undefined;

    const separatorFromBottom = context.height - separator.y / scale;
    const senderAboveSeparator = positions.some(
      (position) =>
        position.x < context.width * 0.52 &&
        position.y > separatorFromBottom + 8 &&
        /EXPEDITEUR|ENVOYEUR|SENDER/.test(position.normalizedText),
    );
    const recipientAboveSeparator = positions.some(
      (position) =>
        position.x > context.width * 0.45 &&
        position.y > separatorFromBottom + 8 &&
        /DESTINATAIRE|POINT.?RELAIS|LIVRAISON/.test(position.normalizedText),
    );
    const lowerSheetBelowSeparator = positions.some(
      (position) =>
        position.y < separatorFromBottom - 8 &&
        /FICHE.{0,20}DESTINATAIRE|DESTINATAIRE.{0,20}FICHE/.test(position.normalizedText),
    );
    if (!senderAboveSeparator || !recipientAboveSeparator || !lowerSheetBelowSeparator) {
      return undefined;
    }

    let barcodeRows = 0;
    const barcodeStartX = Math.round(width * 0.48);
    const barcodeEndX = Math.round(width * 0.975);
    const barcodeEndY = separator.y - Math.round(height * 0.015);
    for (let y = Math.round(height * 0.12); y < barcodeEndY; y += 2) {
      let transitions = 0;
      let wasDark = isDark(barcodeStartX, y);
      for (let x = barcodeStartX + 1; x < barcodeEndX; x += 1) {
        const dark = isDark(x, y);
        if (dark !== wasDark) transitions += 1;
        wasDark = dark;
      }
      if (transitions >= 32) barcodeRows += 1;
    }
    if (barcodeRows < 6) return undefined;

    return Math.max(0, separatorFromBottom - 2);
  } finally {
    await document.destroy();
  }
}

async function createColissimoSplitPdf(source: PDFDocument, splitX: number, rotation: number) {
  const sourcePage = source.getPage(0);
  const { width, height } = sourcePage.getSize();
  const output = await PDFDocument.create();
  const cropBox =
    rotation === 180
      ? { left: width - splitX, bottom: 0, right: width, top: height }
      : { left: 0, bottom: 0, right: splitX, top: height };
  const embedded = await output.embedPage(sourcePage, cropBox);
  const page = output.addPage([TARGET_WIDTH, TARGET_HEIGHT]);
  const rotateCrop = embedded.width > embedded.height;
  const orientedWidth = rotateCrop ? embedded.height : embedded.width;
  const orientedHeight = rotateCrop ? embedded.width : embedded.height;
  const scale = Math.min(TARGET_WIDTH / orientedWidth, TARGET_HEIGHT / orientedHeight);
  const drawnWidth = embedded.width * scale;
  const drawnHeight = embedded.height * scale;
  const pageRotation = ((rotation % 360) + 360) % 360;
  const drawRotation = rotateCrop ? (pageRotation + 90) % 360 : pageRotation;

  page.drawPage(embedded, {
    x: (TARGET_WIDTH - drawnWidth) / 2,
    y: (TARGET_HEIGHT - drawnHeight) / 2,
    width: drawnWidth,
    height: drawnHeight,
    rotate: degrees(drawRotation),
  });
  return output.save();
}

async function createChronopostShop2ShopPdf(source: PDFDocument) {
  const sourcePage = source.getPage(0);
  const output = await PDFDocument.create();
  const embedded = await output.embedPage(sourcePage, CHRONOPOST_SHOP2SHOP_CROP);
  const page = output.addPage([TARGET_WIDTH, TARGET_HEIGHT]);
  const scale = Math.min(TARGET_HEIGHT / embedded.width, TARGET_WIDTH / embedded.height);
  const drawnWidth = embedded.width * scale;
  const drawnHeight = embedded.height * scale;

  page.drawPage(embedded, {
    x: (TARGET_WIDTH + drawnHeight) / 2,
    y: (TARGET_HEIGHT - drawnWidth) / 2,
    width: drawnWidth,
    height: drawnHeight,
    rotate: degrees(90),
  });

  return output.save();
}

async function createFullWidthTopLabelPdf(source: PDFDocument, bottom: number) {
  const sourcePage = source.getPage(0);
  const { width, height } = sourcePage.getSize();
  const output = await PDFDocument.create();
  const embedded = await output.embedPage(sourcePage, {
    left: 0,
    bottom,
    right: width,
    top: height,
  });
  const page = output.addPage([TARGET_WIDTH, TARGET_HEIGHT]);
  const availableWidth = TARGET_WIDTH - 2 * VINTED_MONDIAL_RELAY_PRINT_MARGIN;
  const availableHeight = TARGET_HEIGHT - 2 * VINTED_MONDIAL_RELAY_PRINT_MARGIN;
  const scale = Math.min(availableWidth / embedded.width, availableHeight / embedded.height);
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

function getLabelRegion(context: PdfAnalysisContext, cropA4: boolean): PdfRegion {
  if (!cropA4) {
    return { left: 0, bottom: 0, right: context.width, top: context.height };
  }

  const anchor = findCarrierAnchor(context);
  const landscape = context.width > context.height;
  const cropWidth = landscape ? TARGET_WIDTH + 56 : TARGET_WIDTH;
  const cropHeight = landscape ? TARGET_HEIGHT + 56 : TARGET_HEIGHT;
  const left = landscape
    ? clamp(
        anchor
          ? anchor.x > context.width / 2
            ? anchor.x - 24
            : anchor.x - cropWidth + 24
          : context.width - cropWidth,
        0,
        context.width - cropWidth,
      )
    : clamp((anchor?.x ?? context.width / 2) - TARGET_WIDTH / 2, 0, context.width - TARGET_WIDTH);
  const bottom = landscape
    ? clamp(
        anchor
          ? anchor.y > context.height / 2
            ? anchor.y - cropHeight + 28
            : anchor.y - 28
          : context.height - cropHeight,
        0,
        context.height - cropHeight,
      )
    : clamp(
        anchor ? anchor.y - TARGET_HEIGHT + 35 : context.height - TARGET_HEIGHT,
        0,
        context.height - TARGET_HEIGHT,
      );

  return {
    left,
    bottom,
    right: left + cropWidth,
    top: bottom + cropHeight,
  };
}

async function createLabelPdf(source: PDFDocument, region: PdfRegion) {
  const output = await PDFDocument.create();
  const sourcePage = source.getPage(0);
  const embedded =
    region.left === 0 &&
    region.bottom === 0 &&
    region.right === sourcePage.getWidth() &&
    region.top === sourcePage.getHeight()
      ? await output.embedPage(sourcePage)
      : await output.embedPage(sourcePage, region);

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

export async function preparePdfForPrint(
  filePath: string,
  options: PdfPreparationOptions = {},
): Promise<PdfPreparationResult> {
  const input = new Uint8Array(await readFile(filePath));
  const context = await analyzePdf(input);
  const format = detectPdfFormat(context.width, context.height);
  const fullPage: PdfRegion = { left: 0, bottom: 0, right: context.width, top: context.height };
  const finish = (
    result: Omit<PdfPreparationResult, "strategy">,
    strategy: string,
    region: PdfRegion,
  ): Promise<PdfPreparationResult> => {
    const preparedResult = { ...result, strategy };
    return options.diagnosticsDirectory
      ? addDiagnostics(
          preparedResult,
          input,
          context,
          strategy,
          region,
          options.diagnosticsDirectory,
        )
      : Promise.resolve(preparedResult);
  };
  let carrier = detectCarrier(context);
  let colissimoSplit = detectColissimoSplit(context);
  if (colissimoSplit === undefined) {
    colissimoSplit = await detectColissimoImageSplit(input, context);
    if (colissimoSplit !== undefined) carrier = "COLISSIMO";
  }

  if (colissimoSplit !== undefined) {
    const source = await PDFDocument.load(input);
    const preparedBytes = await createColissimoSplitPdf(source, colissimoSplit, context.rotation);
    const preparedPath = path.join(os.tmpdir(), `bv-pl80e-colissimo-${randomUUID()}.pdf`);
    await writeFile(preparedPath, preparedBytes);
    const region =
      context.rotation === 180
        ? {
            left: context.width - colissimoSplit,
            bottom: 0,
            right: context.width,
            top: context.height,
          }
        : { left: 0, bottom: 0, right: colissimoSplit, top: context.height };
    return finish(
      {
        originalPath: filePath,
        preparedPath,
        carrier,
        format,
        adaptation: "LABEL_EXTRACTED",
        adapted: true,
        compatiblePL80E: true,
      },
      "COLISSIMO_SPLIT",
      region,
    );
  }

  if (detectChronopostShop2ShopLabel(context)) {
    const source = await PDFDocument.load(input);
    const preparedBytes = await createChronopostShop2ShopPdf(source);
    const preparedPath = path.join(
      os.tmpdir(),
      `bv-pl80e-chronopost-shop2shop-${randomUUID()}.pdf`,
    );
    await writeFile(preparedPath, preparedBytes);
    return finish(
      {
        originalPath: filePath,
        preparedPath,
        carrier: "CHRONOPOST",
        format,
        adaptation: "LABEL_EXTRACTED",
        adapted: true,
        compatiblePL80E: true,
      },
      "CHRONOPOST_SHOP2SHOP",
      CHRONOPOST_SHOP2SHOP_CROP,
    );
  }

  const vintedMondialRelayBottom = await detectVintedMondialRelayTopLabel(input, context);
  if (vintedMondialRelayBottom !== undefined) {
    const source = await PDFDocument.load(input);
    const preparedBytes = await createFullWidthTopLabelPdf(source, vintedMondialRelayBottom);
    const preparedPath = path.join(
      os.tmpdir(),
      `bv-pl80e-vinted-mondial-relay-${randomUUID()}.pdf`,
    );
    await writeFile(preparedPath, preparedBytes);
    return finish(
      {
        originalPath: filePath,
        preparedPath,
        carrier,
        format,
        adaptation: "LABEL_EXTRACTED",
        adapted: true,
        compatiblePL80E: true,
      },
      "VINTED_MONDIAL_RELAY_TOP_LABEL",
      { left: 0, bottom: vintedMondialRelayBottom, right: context.width, top: context.height },
    );
  }

  if (format === "100x150") {
    return finish(
      {
        originalPath: filePath,
        preparedPath: filePath,
        carrier,
        format,
        adaptation: "NONE",
        adapted: false,
        compatiblePL80E: true,
      },
      "NATIVE_100X150",
      fullPage,
    );
  }

  if (format === "UNKNOWN") {
    return finish(
      {
        originalPath: filePath,
        preparedPath: filePath,
        carrier,
        format,
        adaptation: "UNSUPPORTED",
        adapted: false,
        compatiblePL80E: false,
      },
      "UNSUPPORTED_UNCHANGED",
      fullPage,
    );
  }

  const region = getLabelRegion(context, format === "A4");
  const source = await PDFDocument.load(input);
  const preparedBytes = await createLabelPdf(source, region);
  const preparedPath = path.join(os.tmpdir(), `bv-pl80e-${randomUUID()}.pdf`);
  await writeFile(preparedPath, preparedBytes);
  return finish(
    {
      originalPath: filePath,
      preparedPath,
      carrier,
      format,
      adaptation: format === "A4" ? "LABEL_EXTRACTED" : "RESIZED",
      adapted: true,
      compatiblePL80E: true,
    },
    format === "A4" ? "GENERIC_A4_CROP" : "PROPORTIONAL_RESIZE",
    region,
  );
}
