-- Phase 7 (Delivery & Logistics Management) was built, then removed at explicit
-- request the same day. This reverses the 20260819085338_delivery_logistics
-- migration: drops the 5 tables it created (in FK-dependency order) and the
-- DeliveryLifecycleStatus enum. The pre-existing Order.deliveryStatus /
-- DeliveryTracking system (from earlier the same day, not part of Phase 7) is
-- untouched by this migration.

-- DropForeignKey (children of Delivery first)
ALTER TABLE "DeliveryProof" DROP CONSTRAINT IF EXISTS "DeliveryProof_deliveryId_fkey";
ALTER TABLE "DeliveryProof" DROP CONSTRAINT IF EXISTS "DeliveryProof_recordedById_fkey";
ALTER TABLE "DeliveryAttempt" DROP CONSTRAINT IF EXISTS "DeliveryAttempt_deliveryId_fkey";
ALTER TABLE "DeliveryAttempt" DROP CONSTRAINT IF EXISTS "DeliveryAttempt_attemptedById_fkey";
ALTER TABLE "DeliveryEvent" DROP CONSTRAINT IF EXISTS "DeliveryEvent_deliveryId_fkey";
ALTER TABLE "DeliveryEvent" DROP CONSTRAINT IF EXISTS "DeliveryEvent_createdById_fkey";
ALTER TABLE "Delivery" DROP CONSTRAINT IF EXISTS "Delivery_orderId_fkey";
ALTER TABLE "Delivery" DROP CONSTRAINT IF EXISTS "Delivery_assignedEmployeeId_fkey";
ALTER TABLE "Delivery" DROP CONSTRAINT IF EXISTS "Delivery_deliveryPartnerId_fkey";
ALTER TABLE "Delivery" DROP CONSTRAINT IF EXISTS "Delivery_createdById_fkey";

-- DropTable (children before parent)
DROP TABLE IF EXISTS "DeliveryProof";
DROP TABLE IF EXISTS "DeliveryAttempt";
DROP TABLE IF EXISTS "DeliveryEvent";
DROP TABLE IF EXISTS "Delivery";
DROP TABLE IF EXISTS "DeliveryPartner";

-- DropEnum
DROP TYPE IF EXISTS "DeliveryLifecycleStatus";
