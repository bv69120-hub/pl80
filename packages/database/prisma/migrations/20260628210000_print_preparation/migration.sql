ALTER TABLE "PrintJob" ADD COLUMN "originalFilePath" TEXT;
ALTER TABLE "PrintJob" ADD COLUMN "preparedFilePath" TEXT;
ALTER TABLE "PrintJob" ADD COLUMN "detectedCarrier" TEXT;
ALTER TABLE "PrintJob" ADD COLUMN "detectedFormat" TEXT;
ALTER TABLE "PrintJob" ADD COLUMN "adaptation" TEXT;
ALTER TABLE "PrintJob" ADD COLUMN "adapted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PrintJob" ADD COLUMN "pl80eCompatible" BOOLEAN NOT NULL DEFAULT false;
