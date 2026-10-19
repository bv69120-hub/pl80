import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import process from "node:process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createCanvas } from "canvas";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { resolvePrintMode, PrinterService } from "../dist/printer.service.js";
import { getFinalPrintStatus } from "../dist/print.worker.js";
import { resolveSumatra, validateBundledSumatra } from "../dist/printer.windows.js";
import {
  detectColissimoSplit,
  detectPdfFormat,
  preparePdfForPrint,
} from "../dist/preparation/pdf.preparation.js";
import { carrierStrategies } from "../dist/preparation/carrier.strategies.js";

const require = createRequire(import.meta.url);
const millimetersToPoints = (millimeters) => (millimeters * 72) / 25.4;

async function createImageOnlyColissimoPdf(pdfPath) {
  const canvas = createCanvas(1200, 847);
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#111111";
  context.lineWidth = 4;
  context.strokeRect(22, 47, 544, 760);
  context.strokeRect(622, 47, 544, 760);
  context.font = "30px sans-serif";
  context.fillStyle = "#111111";
  context.fillText("COLISSIMO", 250, 170);
  context.font = "24px sans-serif";
  context.fillText("DESTINATAIRE", 85, 260);
  context.fillText("PREUVE DE DEPOT", 730, 250);

  for (let index = 0, x = 100; x < 465; index += 1) {
    const width = index % 4 === 0 ? 4 : index % 3 === 0 ? 3 : 2;
    context.fillRect(x, 505, width, 96);
    x += width + (index % 2 === 0 ? 2 : 3);
  }

  const document = await PDFDocument.create();
  const page = document.addPage([670.26, 472.84]);
  const embeddedImage = await document.embedPng(canvas.toBuffer("image/png"));
  page.drawImage(embeddedImage, { x: 0, y: 0, width: 670.26, height: 472.84 });
  await writeFile(pdfPath, await document.save());
}

async function assertThermalColissimoVisual(pdfPath) {
  const outputDocument = await PDFDocument.load(await readFile(pdfPath));
  const outputPage = outputDocument.getPage(0);
  assert.ok(Math.abs(outputPage.getWidth() - millimetersToPoints(100)) < 0.1);
  assert.ok(Math.abs(outputPage.getHeight() - millimetersToPoints(150)) < 0.1);

  const pdfjsRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
  const renderedDocument = await getDocument({
    data: new Uint8Array(await readFile(pdfPath)),
    standardFontDataUrl: `${path.join(pdfjsRoot, "standard_fonts")}${path.sep}`,
  }).promise;
  try {
    const page = await renderedDocument.getPage(1);
    const viewport = page.getViewport({
      scale: 800 / page.getViewport({ scale: 1 }).width,
    });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext("2d");
    await page.render({ canvasContext: context, viewport }).promise;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const isDark = (x, y) => {
      const offset = (y * canvas.width + x) * 4;
      return pixels[offset] < 80 && pixels[offset + 1] < 80 && pixels[offset + 2] < 80;
    };
    const barcodeRows = [];
    for (let y = 600; y < 950; y += 8) {
      let transitions = 0;
      let previous = isDark(40, y);
      for (let x = 41; x < 700; x += 1) {
        const dark = isDark(x, y);
        if (dark !== previous) transitions += 1;
        previous = dark;
      }
      if (transitions >= 32) barcodeRows.push(y);
    }
    assert.ok(barcodeRows.length >= 5, "the extracted barcode remains visually readable");

    let rightPanelInk = 0;
    for (let y = 150; y < 1050; y += 1) {
      for (let x = 680; x < 740; x += 1) {
        if (isDark(x, y)) rightPanelInk += 1;
      }
    }
    assert.ok(rightPanelInk < 2500, "the right-hand proof panel is excluded");
  } finally {
    await renderedDocument.destroy();
  }
}

test("Windows is the default print mode", () => {
  const previous = process.env.PRINT_MODE;
  delete process.env.PRINT_MODE;
  try {
    assert.equal(resolvePrintMode(), "windows");
  } finally {
    if (previous === undefined) delete process.env.PRINT_MODE;
    else process.env.PRINT_MODE = previous;
  }
});

test("simulation mode cannot report a successful print", async () => {
  const previousMode = process.env.PRINT_MODE;
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "bv-printer-test-"));
  const pdfPath = path.join(temporaryDirectory, "label.pdf");
  await writeFile(pdfPath, "%PDF-test");
  process.env.PRINT_MODE = "simulation";
  try {
    const result = await new PrinterService().printPdf({
      filePath: pdfPath,
      printerName: "PL80E",
      copies: 1,
    });
    assert.equal(result.success, false);
    assert.match(result.error ?? "", /cannot confirm a physical print/i);
  } finally {
    if (previousMode === undefined) delete process.env.PRINT_MODE;
    else process.env.PRINT_MODE = previousMode;
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("final states describe submission or spooler observation, never physical output", () => {
  assert.equal(getFinalPrintStatus({ success: false, error: "failed" }), "FAILED");
  assert.equal(getFinalPrintStatus({ success: true }), "SUBMITTED");
  assert.equal(
    getFinalPrintStatus({ success: true, status: "SPOOLER_OBSERVED" }),
    "SPOOLER_OBSERVED",
  );
});

test("Sumatra can be resolved from an explicit local executable path", async () => {
  const variableNames = [
    "PRINT_COMMAND",
    "SUMATRA_PATH",
    "LOCALAPPDATA",
    "ProgramFiles",
    "ProgramFiles(x86)",
    "SUMATRA_BUNDLED_PATH",
  ];
  const previousValues = new Map(variableNames.map((name) => [name, process.env[name]]));
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "bv-sumatra-test-"));
  const executablePath = path.join(temporaryDirectory, "SumatraPDF.exe");
  await writeFile(executablePath, "locally supplied executable fixture");
  for (const name of variableNames) delete process.env[name];
  process.env.SUMATRA_PATH = executablePath;
  try {
    const resolved = resolveSumatra();
    assert.equal(resolved?.path, executablePath);
    assert.equal(resolved?.source, "sumatraPath");
    assert.match(resolved?.sha256 ?? "", /^[A-F0-9]{64}$/);
  } finally {
    for (const [name, value] of previousValues) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("a bundled Sumatra with a valid hash is independent of another local version", async () => {
  const previousLocalAppData = process.env.LOCALAPPDATA;
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "bv-sumatra-bundle-test-"));
  const executablePath = path.join(temporaryDirectory, "SumatraPDF.exe");
  const localAppData = path.join(temporaryDirectory, "user", "AppData", "Local");
  await mkdir(path.join(localAppData, "SumatraPDF"), { recursive: true });
  await writeFile(executablePath, "packaged executable fixture");
  await writeFile(path.join(localAppData, "SumatraPDF", "SumatraPDF.exe"), "other local version");
  const hash = createHash("sha256")
    .update(await readFile(executablePath))
    .digest("hex")
    .toUpperCase();
  await writeFile(`${executablePath}.sha256`, `${hash}\n`);
  process.env.LOCALAPPDATA = localAppData;
  try {
    assert.equal(validateBundledSumatra(executablePath), true);
    await writeFile(`${executablePath}.sha256`, `${"0".repeat(64)}\n`);
    assert.equal(validateBundledSumatra(executablePath), false);
  } finally {
    if (previousLocalAppData === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = previousLocalAppData;
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("100 x 150 mm PDFs remain compatible without adaptation", async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "bv-label-test-"));
  const pdfPath = path.join(temporaryDirectory, "label.pdf");
  const document = await PDFDocument.create();
  document.addPage([millimetersToPoints(100), millimetersToPoints(150)]);
  await writeFile(pdfPath, await document.save());
  try {
    assert.equal(detectPdfFormat(millimetersToPoints(100), millimetersToPoints(150)), "100x150");
    const preparation = await preparePdfForPrint(pdfPath);
    assert.equal(preparation.preparedPath, pdfPath);
    assert.equal(preparation.adaptation, "NONE");
    assert.equal(preparation.compatiblePL80E, true);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("split Colissimo PDFs produce a portrait thermal PDF containing only the left label", async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "bv-colissimo-test-"));
  const pdfPath = path.join(temporaryDirectory, "colissimo-panels.pdf");
  const sourceDocument = await PDFDocument.create();
  const sourcePage = sourceDocument.addPage([842, 595]);
  const font = await sourceDocument.embedFont(StandardFonts.Helvetica);
  sourcePage.drawText("COLISSIMO", { x: 40, y: 545, size: 18, font });
  sourcePage.drawText("NUMERO DE SUIVI", { x: 50, y: 500, size: 11, font });
  sourcePage.drawText("ADRESSE DESTINATAIRE", { x: 55, y: 455, size: 11, font });
  sourcePage.drawText("PREUVE DE DEPOT", { x: 550, y: 545, size: 18, font });
  sourcePage.drawText("INSTRUCTIONS", { x: 560, y: 505, size: 11, font });
  for (let index = 0; index < 32; index += 1) {
    const barWidth = index % 3 === 0 ? 3 : 1.4;
    sourcePage.drawRectangle({
      x: 75 + index * 5,
      y: 205,
      width: barWidth,
      height: 85,
      color: rgb(0, 0, 0),
    });
  }
  sourcePage.drawRectangle({
    x: 600,
    y: 430,
    width: 210,
    height: 100,
    color: rgb(0, 0, 0),
  });
  await writeFile(pdfPath, await sourceDocument.save());

  let preparedPath;
  let renderedDocument;
  try {
    const preparation = await preparePdfForPrint(pdfPath);
    preparedPath = preparation.preparedPath;
    assert.equal(preparation.carrier, "COLISSIMO");
    assert.equal(preparation.adaptation, "LABEL_EXTRACTED");
    assert.equal(preparation.compatiblePL80E, true);
    assert.notEqual(preparation.preparedPath, pdfPath);

    const outputDocument = await PDFDocument.load(await readFile(preparedPath));
    const outputPage = outputDocument.getPage(0);
    assert.ok(Math.abs(outputPage.getWidth() - millimetersToPoints(100)) < 0.1);
    assert.ok(Math.abs(outputPage.getHeight() - millimetersToPoints(150)) < 0.1);

    const pdfjsRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
    renderedDocument = await getDocument({
      data: new Uint8Array(await readFile(preparedPath)),
      standardFontDataUrl: `${path.join(pdfjsRoot, "standard_fonts")}${path.sep}`,
    }).promise;
    const renderedPage = await renderedDocument.getPage(1);
    const viewport = renderedPage.getViewport({
      scale: 800 / renderedPage.getViewport({ scale: 1 }).width,
    });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const canvasContext = canvas.getContext("2d");
    await renderedPage.render({ canvasContext, viewport }).promise;
    const pixels = canvasContext.getImageData(0, 0, canvas.width, canvas.height).data;
    const countDarkPixels = (left, top, right, bottom) => {
      let count = 0;
      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
          const offset = (y * canvas.width + x) * 4;
          if (pixels[offset] < 80 && pixels[offset + 1] < 80 && pixels[offset + 2] < 80) count += 1;
        }
      }
      return count;
    };

    assert.ok(countDarkPixels(220, 600, 620, 900) > 500, "left barcode remains visible");
    assert.equal(countDarkPixels(730, 50, 790, 350), 0, "right deposit-proof panel is cropped out");
  } finally {
    await renderedDocument?.destroy();
    if (preparedPath && preparedPath !== pdfPath) await rm(preparedPath, { force: true });
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("image-only Colissimo panels are detected and visually extracted", async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "bv-colissimo-image-test-"));
  const pdfPath = path.join(temporaryDirectory, "colissimo-image-only.pdf");
  let preparedPath;
  await createImageOnlyColissimoPdf(pdfPath);
  try {
    const preparation = await preparePdfForPrint(pdfPath);
    preparedPath = preparation.preparedPath;
    assert.equal(preparation.carrier, "COLISSIMO");
    assert.equal(preparation.adaptation, "LABEL_EXTRACTED");
    assert.notEqual(preparation.preparedPath, pdfPath);
    await assertThermalColissimoVisual(preparedPath);
  } finally {
    if (preparedPath && preparedPath !== pdfPath) await rm(preparedPath, { force: true });
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("unrecognized landscape PDFs are not cropped by the Colissimo image detector", async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "bv-landscape-test-"));
  const pdfPath = path.join(temporaryDirectory, "unknown-landscape.pdf");
  const document = await PDFDocument.create();
  document.addPage([670.26, 472.84]);
  await writeFile(pdfPath, await document.save());
  try {
    const preparation = await preparePdfForPrint(pdfPath);
    assert.equal(preparation.carrier, "UNKNOWN");
    assert.equal(preparation.preparedPath, pdfPath);
    assert.equal(preparation.adaptation, "UNSUPPORTED");
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test(
  "the real image-only Colissimo reference is visually extracted",
  { skip: !process.env.BV_COLISSIMO_REFERENCE_PDF },
  async () => {
    const pdfPath = process.env.BV_COLISSIMO_REFERENCE_PDF;
    let preparedPath;
    try {
      const pdfjsRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
      const sourceDocument = await getDocument({
        data: new Uint8Array(await readFile(pdfPath)),
        standardFontDataUrl: `${path.join(pdfjsRoot, "standard_fonts")}${path.sep}`,
      }).promise;
      try {
        const sourcePage = await sourceDocument.getPage(1);
        const textContent = await sourcePage.getTextContent();
        assert.equal(
          textContent.items.filter((item) => "str" in item && item.str.trim()).length,
          0,
          "the real reference exercises image-only recognition",
        );
      } finally {
        await sourceDocument.destroy();
      }

      const preparation = await preparePdfForPrint(pdfPath);
      preparedPath = preparation.preparedPath;
      assert.equal(preparation.carrier, "COLISSIMO");
      assert.equal(preparation.adaptation, "LABEL_EXTRACTED");
      await assertThermalColissimoVisual(preparedPath);
    } finally {
      if (preparedPath && preparedPath !== pdfPath) await rm(preparedPath, { force: true });
    }
  },
);

test("Colissimo split detection requires a left label, right receipt text and a central gutter", () => {
  const context = {
    width: 842,
    height: 595,
    rotation: 0,
    text: "COLISSIMO PREUVE DE DEPOT",
    textPositions: [
      { text: "COLISSIMO", x: 40, y: 545 },
      { text: "DESTINATAIRE", x: 80, y: 450 },
      { text: "PREUVE DE DEPOT", x: 550, y: 545 },
      { text: "INSTRUCTIONS", x: 560, y: 500 },
    ],
  };
  assert.ok(detectColissimoSplit(context));
  assert.equal(detectColissimoSplit({ ...context, text: "CHRONOPOST PREUVE DE DEPOT" }), undefined);
  assert.equal(
    detectColissimoSplit({
      ...context,
      text: "COLISSIMO DESTINATAIRE INSTRUCTIONS",
      textPositions: context.textPositions.filter(
        (position) => !/PREUVE|DEPOT/.test(position.text),
      ),
    }),
    undefined,
  );
  assert.equal(
    detectColissimoSplit({
      ...context,
      text: "COLISSIMO DESTINATAIRE",
      textPositions: context.textPositions.filter(
        (position) => !/PREUVE|DEPOT|INSTRUCTIONS/.test(position.text),
      ),
    }),
    undefined,
  );
  assert.equal(
    detectColissimoSplit({
      ...context,
      textPositions: context.textPositions.map((position) => ({ ...position, x: 80 })),
    }),
    undefined,
  );
});

test("existing Vinted and Chronopost recognition strategies remain configured", () => {
  assert.ok(carrierStrategies.some((strategy) => strategy.carrier === "VINTED"));
  assert.ok(carrierStrategies.some((strategy) => strategy.carrier === "CHRONOPOST"));
});
