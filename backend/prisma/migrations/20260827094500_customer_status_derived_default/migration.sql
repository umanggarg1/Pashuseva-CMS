-- Phase 19 (part C): Customer.status becomes fully derived from order history —
-- change the column default for future rows, and reconcile every existing
-- non-trashed customer's status against their *current* order set right now, using
-- the same "is this order active" rule the app enforces going forward (see
-- backend/src/utils/customerAutomation.ts's isOrderActive):
--   active  = deliveryStatus NOT IN (DELIVERED, RETURNED, LOST, DAMAGED)
--             AND NOT (orderStatus = CANCELLED AND deliveryStatus = NOT_DISPATCHED)
-- A customer is ACTIVE if any non-trashed order of theirs is still active by that
-- rule, INACTIVE otherwise (including customers with zero orders at all).

ALTER TABLE "Customer" ALTER COLUMN "status" SET DEFAULT 'INACTIVE';

UPDATE "Customer" c
SET "status" = CASE
  WHEN EXISTS (
    SELECT 1 FROM "Order" o
    WHERE o."customerId" = c."id"
      AND o."deletedAt" IS NULL
      AND o."deliveryStatus" NOT IN ('DELIVERED', 'RETURNED', 'LOST', 'DAMAGED')
      AND NOT (o."orderStatus" = 'CANCELLED' AND o."deliveryStatus" = 'NOT_DISPATCHED')
  ) THEN 'ACTIVE'::"CustomerStatus"
  ELSE 'INACTIVE'::"CustomerStatus"
END
WHERE c."deletedAt" IS NULL;
