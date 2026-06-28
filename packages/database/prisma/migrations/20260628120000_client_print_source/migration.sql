PRAGMA foreign_keys=OFF;

CREATE TABLE "new_PrintJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'EMPLOYEE' CHECK ("source" IN ('CLIENT', 'EMPLOYEE')),
    "printerName" TEXT NOT NULL DEFAULT 'PL80E',
    "copies" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    CONSTRAINT "PrintJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_PrintJob" ("id", "filename", "status", "copies", "createdAt", "userId")
SELECT "id", "filename", "status", "copies", "createdAt", "userId" FROM "PrintJob";

DROP TABLE "PrintJob";
ALTER TABLE "new_PrintJob" RENAME TO "PrintJob";
CREATE INDEX "PrintJob_userId_idx" ON "PrintJob"("userId");
CREATE INDEX "PrintJob_source_status_idx" ON "PrintJob"("source", "status");

PRAGMA foreign_keys=ON;
