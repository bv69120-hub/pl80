import os from "node:os";
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { createCanvas } from "canvas";
import { PDFDocument } from "pdf-lib";
import { AnnotationMode, getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const require = createRequire(import.meta.url);
const THERMAL_WIDTH = 800;
const THERMAL_HEIGHT = 1200;
const SAFETY_MARGIN = 8;
const RENDER_ENGINE = "pdfjs-dist 4.8.69 + node-canvas";
const PDF_WRAPPER_ENGINE = "pdf-lib 1.17.1";
const POINTS_PER_MM = 72 / 25.4;
const THERMAL_PAGE_WIDTH_MM = 100;
const THERMAL_PAGE_HEIGHT_MM = 150;

export interface ThermalRasterResult {
  path: string;
  width: number;
  height: number;
  size: number;
  engine: string;
}

export interface ThermalPrintPdfResult {
  path: string;
  widthMm: number;
  heightMm: number;
  widthPoints: number;
  heightPoints: number;
  size: number;
  engine: string;
}

export async function createThermalPrintPdf(
  raster: ThermalRasterResult,
): Promise<ThermalPrintPdfResult> {
  const pngBytes = await readFile(raster.path);
  const document = await PDFDocument.create();
  const embeddedPng = await document.embedPng(pngBytes);
  const widthPoints = THERMAL_PAGE_WIDTH_MM * POINTS_PER_MM;
  const heightPoints = THERMAL_PAGE_HEIGHT_MM * POINTS_PER_MM;
  const page = document.addPage([widthPoints, heightPoints]);

  // The 800x1200 raster fills the 100x150 mm page exactly: no PDF margin,
  // no second scaling step, and an effective resolution of about 203 DPI.
  page.drawImage(embeddedPng, {
    x: 0,
    y: 0,
    width: widthPoints,
    height: heightPoints,
  });

  const bytes = await document.save({ useObjectStreams: false });
  const outputPath = path.join(os.tmpdir(), `bv-pl80e-${randomUUID()}.thermal.pdf`);
  await writeFile(outputPath, bytes);
  return {
    path: outputPath,
    widthMm: THERMAL_PAGE_WIDTH_MM,
    heightMm: THERMAL_PAGE_HEIGHT_MM,
    widthPoints,
    heightPoints,
    size: bytes.length,
    engine: PDF_WRAPPER_ENGINE,
  };
}

export async function rasterizeThermalPdf(preparedPdfPath: string): Promise<ThermalRasterResult> {
  const pdfjsRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
  const standardFontDataUrl = `${path.join(pdfjsRoot, "standard_fonts")}${path.sep}`;
  const data = new Uint8Array(await readFile(preparedPdfPath));
  const loadingTask = getDocument({
    data,
    standardFontDataUrl,
    enableXfa: true,
    useSystemFonts: true,
    disableFontFace: false,
  });
  const document = await loadingTask.promise;
  try {
    const page = await document.getPage(1);
    const initialViewport = page.getViewport({ scale: 1 });
    const rotation =
      initialViewport.width > initialViewport.height ? page.rotate + 90 : page.rotate;
    const portraitViewport = page.getViewport({ scale: 1, rotation });
    const innerWidth = THERMAL_WIDTH - SAFETY_MARGIN * 2;
    const innerHeight = THERMAL_HEIGHT - SAFETY_MARGIN * 2;
    const scale = Math.min(
      innerWidth / portraitViewport.width,
      innerHeight / portraitViewport.height,
    );
    const viewport = page.getViewport({ scale, rotation });
    const offsetX = Math.round((THERMAL_WIDTH - viewport.width) / 2);
    const offsetY = Math.round((THERMAL_HEIGHT - viewport.height) / 2);
    const canvas = createCanvas(THERMAL_WIDTH, THERMAL_HEIGHT);
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, THERMAL_WIDTH, THERMAL_HEIGHT);
    const optionalContentConfigPromise = document.getOptionalContentConfig({ intent: "print" });
    await page.render({
      canvasContext: context as never,
      viewport,
      intent: "print",
      annotationMode: AnnotationMode.ENABLE_STORAGE,
      optionalContentConfigPromise,
      transform: [1, 0, 0, 1, offsetX, offsetY],
      background: "rgb(255,255,255)",
    }).promise;
    const png = canvas.toBuffer("image/png");
    const outputPath = path.join(os.tmpdir(), `bv-pl80e-${randomUUID()}.png`);
    await writeFile(outputPath, png);
    return {
      path: outputPath,
      width: THERMAL_WIDTH,
      height: THERMAL_HEIGHT,
      size: png.length,
      engine: RENDER_ENGINE,
    };
  } finally {
    await document.destroy();
  }
}
