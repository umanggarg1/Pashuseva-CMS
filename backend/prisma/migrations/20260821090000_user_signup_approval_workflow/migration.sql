-- Phase 15: public signup + Admin-approval workflow, plus making Manager permissions
-- configurable (authorize() no longer auto-bypasses for MANAGER, only ADMIN does).

-- AlterEnum
ALTER TYPE "AccountStatus" ADD VALUE 'PENDING';
ALTER TYPE "AccountStatus" ADD VALUE 'REJECTED';

-- AlterTable: role becomes nullable (null = signed up, not yet approved) and loses
-- its default — every Admin/Manager-created account still explicitly sets a role at
-- creation time, so no existing behavior changes for that flow.
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" DROP NOT NULL;

ALTER TABLE "User" ADD COLUMN "phone" TEXT;
ALTER TABLE "User" ADD COLUMN "requestedRole" "Role";
ALTER TABLE "User" ADD COLUMN "reviewedById" INTEGER;
ALTER TABLE "User" ADD COLUMN "reviewedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "suspendedById" INTEGER;
ALTER TABLE "User" ADD COLUMN "suspendedAt" TIMESTAMP(3);

ALTER TABLE "User" ADD CONSTRAINT "User_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_suspendedById_fkey" FOREIGN KEY ("suspendedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: every existing Manager previously had unconditional full access
-- (authorize() bypassed permission checks for MANAGER entirely) and zero
-- UserPermission rows, because none were ever needed. Now that MANAGER is checked
-- against real grants like EMPLOYEE, ship this without silently locking out anyone
-- already active — grant every existing Manager the full permission list once, as
-- of this migration. Newly approved Managers from this point on get whatever the
-- Admin picks at approval time; this backfill does not apply to them.
INSERT INTO "UserPermission" ("userId", "permission", "createdAt", "updatedAt")
SELECT u.id, p.permission, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User" u
CROSS JOIN (VALUES
  ('customer:view'), ('customer:create'), ('customer:update'),
  ('order:view'), ('order:create'), ('order:update'), ('order:cancel'),
  ('product:view'), ('product:create'), ('product:update'),
  ('delivery:view'), ('delivery:update'),
  ('stock:add'), ('stock:adjust'),
  ('payment:view'), ('payment:create'), ('payment:edit'),
  ('report:view')
) AS p(permission)
WHERE u.role = 'MANAGER'
ON CONFLICT ("userId", "permission") DO NOTHING;
