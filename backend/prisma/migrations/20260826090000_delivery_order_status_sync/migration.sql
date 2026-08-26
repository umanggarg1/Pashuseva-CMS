-- Phase 17: Delivery Status becomes the source of truth for normal delivery
-- progression, with Order Status auto-synced by the app — see orderService's
-- DELIVERY_TO_ORDER_STATUS.

-- DeliveryStatus: purely additive (Out for Delivery, plus the return/exception
-- branch). Each ADD VALUE must be its own statement and isn't used later in this
-- same migration, so this is safe inside Prisma's default transactional apply.
ALTER TYPE "DeliveryStatus" ADD VALUE 'OUT_FOR_DELIVERY';
ALTER TYPE "DeliveryStatus" ADD VALUE 'RETURN_PENDING';
ALTER TYPE "DeliveryStatus" ADD VALUE 'RETURN_IN_TRANSIT';
ALTER TYPE "DeliveryStatus" ADD VALUE 'RETURNED';
ALTER TYPE "DeliveryStatus" ADD VALUE 'LOST';
ALTER TYPE "DeliveryStatus" ADD VALUE 'DAMAGED';

-- OrderStatus: adds Out for Delivery/Delivered and removes Completed (Postgres has
-- no ALTER TYPE ... DROP VALUE, so this is the standard rename-recreate-migrate-drop
-- sequence). Existing COMPLETED orders become DELIVERED — that's what Completed
-- meant in practice before this app tracked delivery progression this closely.
ALTER TABLE "Order" ALTER COLUMN "orderStatus" DROP DEFAULT;
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PROCESSING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED');
ALTER TABLE "Order" ALTER COLUMN "orderStatus" TYPE "OrderStatus" USING (
  CASE "orderStatus"::text
    WHEN 'COMPLETED' THEN 'DELIVERED'
    ELSE "orderStatus"::text
  END
)::"OrderStatus";
ALTER TABLE "Order" ALTER COLUMN "orderStatus" SET DEFAULT 'PENDING';
DROP TYPE "OrderStatus_old";
