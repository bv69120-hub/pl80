import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, test } from "node:test";
import jwt from "jsonwebtoken";
import { prisma } from "@bv/database";
import { printQueue } from "@bv/printer";
import {
  createPreparedPrintJob,
  MANUAL_REVIEW_MESSAGE,
} from "../dist/print-jobs/print.jobs.routes.js";
import { createApp } from "../dist/app.js";

const TOKEN_SECRET = "bv-expedition-pro-development-secret";
const server = createApp().listen(0, "127.0.0.1");
const originalUserFindUnique = prisma.user.findUnique;
const originalIncidentCreate = prisma.carrierIncident.create;
const originalIncidentFindMany = prisma.carrierIncident.findMany;
const originalPrintJobCreate = prisma.printJob.create;
const originalEnqueue = printQueue.enqueue;
let queueCalls = 0;
let incidentRecords = [];

prisma.user.findUnique = async ({ where }) => ({
  id: where.id ?? "pilot-safety-user",
  username: "pilot-safety-user",
  role: "EMPLOYE",
  passwordHash: "unused",
});
prisma.carrierIncident.create = async ({ data }) => {
  const incident = {
    id: `incident-${incidentRecords.length + 1}`,
    ...data,
    createdAt: new Date("2026-07-29T12:00:00.000Z"),
  };
  incidentRecords.push(incident);
  return incident;
};
prisma.carrierIncident.findMany = async () => incidentRecords;
prisma.printJob.create = async ({ data }) => ({ id: "pilot-job", ...data });
printQueue.enqueue = () => {
  queueCalls += 1;
};

await once(server, "listening");
const address = server.address();
assert.ok(address && typeof address === "object");
const baseUrl = `http://127.0.0.1:${address.port}`;

function headers(role = "EMPLOYE") {
  const token = jwt.sign(
    {
      sub: "pilot-safety-user",
      id: "pilot-safety-user",
      username: "pilot-safety-user",
      role,
    },
    TOKEN_SECRET,
    { expiresIn: "8h" },
  );
  return { Authorization: `Bearer ${token}` };
}

before(() => {
  incidentRecords = [];
});

after(async () => {
  prisma.user.findUnique = originalUserFindUnique;
  prisma.carrierIncident.create = originalIncidentCreate;
  prisma.carrierIncident.findMany = originalIncidentFindMany;
  prisma.printJob.create = originalPrintJobCreate;
  printQueue.enqueue = originalEnqueue;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test("unsupported and uncertain PDF preparations are persisted but never enqueued", async () => {
  const basePreparation = {
    originalPath: "source.pdf",
    preparedPath: "prepared.pdf",
    carrier: "UNKNOWN",
    format: "A4",
    strategy: "GENERIC_A4_CROP",
    adaptation: "LABEL_EXTRACTED",
    adapted: true,
    compatiblePL80E: true,
  };

  const uncertain = await createPreparedPrintJob({
    filename: "anonymous.pdf",
    preparation: basePreparation,
    originalFilePath: "archived.pdf",
    source: "CLIENT",
  });
  assert.equal(uncertain.reviewRequired, true);
  assert.equal(uncertain.job.status, "REVIEW_REQUIRED");
  assert.equal(uncertain.job.errorMessage, MANUAL_REVIEW_MESSAGE);
  assert.equal(uncertain.job.preparedFilePath, null);
  assert.equal(queueCalls, 0);

  const unsupported = await createPreparedPrintJob({
    filename: "anonymous.pdf",
    preparation: {
      ...basePreparation,
      strategy: "UNSUPPORTED_UNCHANGED",
      adaptation: "UNSUPPORTED",
      compatiblePL80E: false,
    },
    originalFilePath: "archived.pdf",
    source: "CLIENT",
  });
  assert.equal(unsupported.reviewRequired, true);
  assert.equal(queueCalls, 0);

  const established = await createPreparedPrintJob({
    filename: "anonymous.pdf",
    preparation: {
      ...basePreparation,
      carrier: "CHRONOPOST",
    },
    originalFilePath: "archived.pdf",
    source: "EMPLOYEE",
  });
  assert.equal(established.reviewRequired, false);
  assert.equal(established.job.status, "PENDING");
  assert.equal(queueCalls, 1, "the established Chronopost path remains queued");
});

test("incident reports require authentication and reject unstructured personal data", async () => {
  const unauthenticated = await globalThis.fetch(`${baseUrl}/api/incidents`);
  assert.equal(unauthenticated.status, 401);
  const publicPortalPath = await globalThis.fetch(`${baseUrl}/demo-store/api/incidents`, {
    method: "POST",
  });
  assert.equal(publicPortalPath.status, 404);

  const incident = {
    carrier: "VINTED",
    labelType: "VINTED_GO",
    cropResult: "INCORRECT",
    issueType: "BARCODE_CUT",
    printResult: "FAILED",
    physicalVerified: true,
  };
  const created = await globalThis.fetch(`${baseUrl}/api/incidents`, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify(incident),
  });
  assert.equal(created.status, 201);
  const result = await created.json();
  assert.equal(result.incident.carrier, incident.carrier);
  assert.deepEqual(
    Object.keys(incidentRecords[0]).sort(),
    [
      "carrier",
      "createdAt",
      "cropResult",
      "id",
      "issueType",
      "labelType",
      "physicalVerified",
      "printResult",
    ].sort(),
  );

  const personalData = await globalThis.fetch(`${baseUrl}/api/incidents`, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({ ...incident, trackingNumber: "PERSONAL-TRACKING" }),
  });
  assert.equal(personalData.status, 400);
  assert.equal(incidentRecords.length, 1, "invalid reports are not persisted");

  const listed = await globalThis.fetch(`${baseUrl}/api/incidents`, { headers: headers() });
  assert.equal(listed.status, 200);
  const listResult = await listed.json();
  assert.equal(listResult.incidents.length, 1);
});
