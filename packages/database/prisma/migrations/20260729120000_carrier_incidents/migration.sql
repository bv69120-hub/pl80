CREATE TABLE "CarrierIncident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "carrier" TEXT NOT NULL,
    "labelType" TEXT NOT NULL,
    "cropResult" TEXT NOT NULL,
    "issueType" TEXT NOT NULL,
    "printResult" TEXT NOT NULL,
    "physicalVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "CarrierIncident_createdAt_idx" ON "CarrierIncident"("createdAt");
