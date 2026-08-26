-- Phase 18 (item 2): replace Order.assignedEmployeeId (single FK) with a join
-- table so several employees can share one order, not just be informed about it.

-- 1. Create the join table
CREATE TABLE "OrderAssignedEmployee" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderAssignedEmployee_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderAssignedEmployee_orderId_employeeId_key" ON "OrderAssignedEmployee"("orderId", "employeeId");

CREATE INDEX "OrderAssignedEmployee_orderId_idx" ON "OrderAssignedEmployee"("orderId");

CREATE INDEX "OrderAssignedEmployee_employeeId_idx" ON "OrderAssignedEmployee"("employeeId");

ALTER TABLE "OrderAssignedEmployee" ADD CONSTRAINT "OrderAssignedEmployee_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrderAssignedEmployee" ADD CONSTRAINT "OrderAssignedEmployee_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2. Backfill existing single assignments into the join table
INSERT INTO "OrderAssignedEmployee" ("orderId", "employeeId", "assignedAt")
SELECT "id", "assignedEmployeeId", CURRENT_TIMESTAMP
FROM "Order"
WHERE "assignedEmployeeId" IS NOT NULL;

-- 3. Drop the old scalar column (and its FK/index)
ALTER TABLE "Order" DROP CONSTRAINT "Order_assignedEmployeeId_fkey";

DROP INDEX "Order_assignedEmployeeId_idx";

ALTER TABLE "Order" DROP COLUMN "assignedEmployeeId";
