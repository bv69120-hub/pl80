import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { readdir, rm, stat } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import process from "node:process";
import { after, before, test } from "node:test";
import jwt from "jsonwebtoken";
import { prisma } from "@bv/database";
import { printerService } from "@bv/printer";
import { createApp } from "../dist/app.js";

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const TOKEN_SECRET = randomBytes(32).toString("base64url");
process.env.JWT_SECRET = TOKEN_SECRET;
const pdfRequire = createRequire(
  fileURLToPath(new globalThis.URL("../../../packages/printer/dist/index.js", import.meta.url)),
);
const { PDFDocument } = pdfRequire("pdf-lib");
const server = createApp().listen(0, "127.0.0.1");
const originalFindUnique = prisma.user.findUnique;
const originalPrintPdf = printerService.printPdf;
let currentRole = "ADMIN";
let printCallCount = 0;
let temporaryDirectoriesBefore = new Set();

prisma.user.findUnique = async ({ where }) => ({
  id: where.id ?? "label-test-user",
  username: "label-test-user",
  role: currentRole,
  passwordHash: "unused",
});

function tokenFor(role = currentRole) {
  return jwt.sign(
    {
      sub: "label-test-user",
      id: "label-test-user",
      username: "label-test-user",
      role,
    },
    TOKEN_SECRET,
    { expiresIn: "8h" },
  );
}

function headers(role = currentRole) {
  return { Authorization: `Bearer ${tokenFor(role)}` };
}

function pdfForm(bytes, category = "CHRONOPOST") {
  const form = new globalThis.FormData();
  form.append("selectedCategory", category);
  form.append("modelName", "BV-062 synthetic test");
  form.append(
    "file",
    new globalThis.Blob([bytes], { type: "application/pdf" }),
    "anonymous-label.pdf",
  );
  return form;
}

async function createSyntheticPdf() {
  const document = await PDFDocument.create();
  const page = document.addPage([283.46, 425.2]);
  page.drawText("ANONYMOUS SYNTHETIC SHIPPING LABEL");
  page.drawText("SENDER / RECIPIENT / BARCODE PLACEHOLDER", { y: 200 });
  return Buffer.from(await document.save());
}

async function analyze(pdfBytes, role = "ADMIN", category = "CHRONOPOST") {
  return globalThis.fetch(`${baseUrl}/api/label-tests/analyze`, {
    method: "POST",
    headers: headers(role),
    body: pdfForm(pdfBytes, category),
  });
}

async function listTemporaryDirectories() {
  const names = await readdir(os.tmpdir());
  return names
    .filter((name) => name.startsWith("bv-label-test-"))
    .map((name) => path.join(os.tmpdir(), name));
}

async function waitForRemoval(directory) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await stat(directory);
    } catch {
      return;
    }
    await delay(20);
  }
  assert.fail("Temporary label analysis directory was not removed.");
}

await once(server, "listening");
const address = server.address();
assert.ok(address && typeof address === "object");
const baseUrl = `http://127.0.0.1:${address.port}`;

before(async () => {
  temporaryDirectoriesBefore = new Set(await listTemporaryDirectories());
});

after(async () => {
  printerService.printPdf = originalPrintPdf;
  prisma.user.findUnique = originalFindUnique;
  const currentDirectories = await listTemporaryDirectories();
  await Promise.all(
    currentDirectories
      .filter((directory) => !temporaryDirectoriesBefore.has(directory))
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test("all label-test routes require authentication and are not mounted at public portal paths", async () => {
  for (const [method, pathname] of [
    ["POST", "/api/label-tests/analyze"],
    ["GET", "/api/label-tests/not-a-valid-run/original"],
    ["POST", "/api/label-tests/not-a-valid-run/print"],
    ["POST", "/api/label-tests/not-a-valid-run/physical-validation"],
    ["DELETE", "/api/label-tests/not-a-valid-run"],
  ]) {
    const response = await globalThis.fetch(`${baseUrl}${pathname}`, { method });
    assert.equal(response.status, 401, `${method} ${pathname} must require authentication`);
  }

  const portalRoute = await globalThis.fetch(`${baseUrl}/demo-store/api/label-tests/analyze`, {
    method: "POST",
  });
  assert.equal(portalRoute.status, 404);
});

test("EMPLOYEE accounts are denied while ADMIN accounts can analyze a synthetic PDF", async () => {
  currentRole = "EMPLOYE";
  const employeeResponse = await analyze(await createSyntheticPdf(), "EMPLOYE");
  assert.equal(employeeResponse.status, 403);
  assert.equal(printCallCount, 0);

  currentRole = "ADMIN";
  const response = await analyze(await createSyntheticPdf());
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.selectedCategory, "CHRONOPOST");
  assert.deepEqual(Object.keys(result.previews).sort(), ["extracted", "original", "prepared"]);
  assert.equal(result.physicalPrintRequested, false);
  assert.equal(printCallCount, 0, "analysis must never invoke the printer");

  const temporaryDirectories = await listTemporaryDirectories();
  const createdDirectories = temporaryDirectories.filter(
    (directory) => !temporaryDirectoriesBefore.has(directory),
  );
  assert.ok(createdDirectories.length > 0, "analysis artifacts are kept in a temporary directory");

  for (const view of ["original", "extracted", "prepared"]) {
    const preview = await globalThis.fetch(`${baseUrl}${result.previews[view]}`, {
      headers: headers("ADMIN"),
    });
    assert.equal(preview.status, 200, `${view} preview must be available to an admin`);
    assert.match(preview.headers.get("content-type") ?? "", /application\/pdf/);
  }

  currentRole = "EMPLOYE";
  const employeePreview = await globalThis.fetch(`${baseUrl}${result.previews.original}`, {
    headers: headers("EMPLOYE"),
  });
  assert.equal(employeePreview.status, 403);
  currentRole = "ADMIN";

  printerService.printPdf = async () => {
    printCallCount += 1;
    return { success: true, status: "SUBMITTED" };
  };

  const unconfirmedPrint = await globalThis.fetch(`${baseUrl}/api/label-tests/${result.id}/print`, {
    method: "POST",
    headers: { ...headers("ADMIN"), "Content-Type": "application/json" },
    body: JSON.stringify({ confirmed: false }),
  });
  assert.equal(unconfirmedPrint.status, 400);
  assert.equal(printCallCount, 0, "a missing confirmation must not invoke the printer");

  const confirmedPrint = await globalThis.fetch(`${baseUrl}/api/label-tests/${result.id}/print`, {
    method: "POST",
    headers: { ...headers("ADMIN"), "Content-Type": "application/json" },
    body: JSON.stringify({ confirmed: true }),
  });
  assert.equal(confirmedPrint.status, 202);
  assert.equal(printCallCount, 1, "only the confirmed test request invokes the mocked printer");

  const deleted = await globalThis.fetch(`${baseUrl}/api/label-tests/${result.id}`, {
    method: "DELETE",
    headers: headers("ADMIN"),
  });
  assert.equal(deleted.status, 204);
  await waitForRemoval(createdDirectories[0]);
});

test("invalid and oversized PDFs are rejected without printing", async () => {
  const callsBeforeInvalidUploads = printCallCount;
  const invalid = await analyze(Buffer.from("%PDF-1.7\nnot a valid PDF"));
  assert.equal(invalid.status, 422);

  const oversized = await analyze(Buffer.alloc(MAX_PDF_BYTES + 1, 65));
  assert.equal(oversized.status, 413);
  assert.equal(printCallCount, callsBeforeInvalidUploads);
});

test("all five carrier categories are accepted for separate visual review", async () => {
  currentRole = "ADMIN";
  const callsBeforeAnalyses = printCallCount;
  for (const category of ["CHRONOPOST", "COLISSIMO", "MONDIAL_RELAY", "VINTED", "RELAIS_COLIS"]) {
    const response = await analyze(await createSyntheticPdf(), "ADMIN", category);
    assert.equal(response.status, 201, `${category} selection must be accepted`);
    const result = await response.json();
    assert.equal(result.selectedCategory, category);
    assert.deepEqual(Object.keys(result.previews).sort(), ["extracted", "original", "prepared"]);
    assert.equal(result.physicalPrintRequested, false);
    const deleted = await globalThis.fetch(`${baseUrl}/api/label-tests/${result.id}`, {
      method: "DELETE",
      headers: headers("ADMIN"),
    });
    assert.equal(deleted.status, 204);
  }
  assert.equal(printCallCount, callsBeforeAnalyses, "category analysis and cleanup must not print");
});

test("expired analysis previews return 404 and delete the temporary document", async () => {
  const response = await analyze(await createSyntheticPdf());
  assert.equal(response.status, 201);
  const result = await response.json();
  const createdDirectories = (await listTemporaryDirectories()).filter(
    (directory) => !temporaryDirectoriesBefore.has(directory),
  );
  const directory = createdDirectories.at(-1);
  assert.ok(directory);

  const originalNow = Date.now;
  try {
    const future = originalNow() + 31 * 60 * 1000;
    Date.now = () => future;
    const expiredPreview = await globalThis.fetch(`${baseUrl}${result.previews.original}`, {
      headers: headers("ADMIN"),
    });
    assert.equal(expiredPreview.status, 404);
  } finally {
    Date.now = originalNow;
  }
  await waitForRemoval(directory);
});
