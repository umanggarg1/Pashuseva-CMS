-- Phase 19 (part B): replace Customer.assignedEmployeeId (single FK) with a join
-- table so several employees can share one customer, not just be informed about it.

-- 1. Create the join table
CREATE TABLE "CustomerAssignedEmployee" (
    "id" SERIAL NOT NULL,
    "customerId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerAssignedEmployee_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerAssignedEmployee_customerId_employeeId_key" ON "CustomerAssignedEmployee"("customerId", "employeeId");

CREATE INDEX "CustomerAssignedEmployee_customerId_idx" ON "CustomerAssignedEmployee"("customerId");

CREATE INDEX "CustomerAssignedEmployee_employeeId_idx" ON "CustomerAssignedEmployee"("employeeId");

ALTER TABLE "CustomerAssignedEmployee" ADD CONSTRAINT "CustomerAssignedEmployee_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CustomerAssignedEmployee" ADD CONSTRAINT "CustomerAssignedEmployee_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2. Backfill existing single assignments into the join table
INSERT INTO "CustomerAssignedEmployee" ("customerId", "employeeId", "assignedAt")
SELECT "id", "assignedEmployeeId", CURRENT_TIMESTAMP
FROM "Customer"
WHERE "assignedEmployeeId" IS NOT NULL;

-- 3. Drop the old scalar column (and its FK/index)
ALTER TABLE "Customer" DROP CONSTRAINT "Customer_assignedEmployeeId_fkey";

DROP INDEX "Customer_assignedEmployeeId_idx";

ALTER TABLE "Customer" DROP COLUMN "assignedEmployeeId";
