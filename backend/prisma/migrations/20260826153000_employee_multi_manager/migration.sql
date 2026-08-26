-- Phase 18 (item 3): replace User.managerId (single FK) with a join table so an
-- Employee can report to several Managers at once.

-- 1. Create the join table
CREATE TABLE "EmployeeManager" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "managerId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeManager_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmployeeManager_employeeId_managerId_key" ON "EmployeeManager"("employeeId", "managerId");

CREATE INDEX "EmployeeManager_employeeId_idx" ON "EmployeeManager"("employeeId");

CREATE INDEX "EmployeeManager_managerId_idx" ON "EmployeeManager"("managerId");

ALTER TABLE "EmployeeManager" ADD CONSTRAINT "EmployeeManager_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EmployeeManager" ADD CONSTRAINT "EmployeeManager_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2. Backfill every existing managerId value into the join table
INSERT INTO "EmployeeManager" ("employeeId", "managerId", "createdAt")
SELECT "id", "managerId", CURRENT_TIMESTAMP
FROM "User"
WHERE "managerId" IS NOT NULL;

-- 3. Drop the old scalar column (and its FK/index)
ALTER TABLE "User" DROP CONSTRAINT "User_managerId_fkey";

DROP INDEX "User_managerId_idx";

ALTER TABLE "User" DROP COLUMN "managerId";
