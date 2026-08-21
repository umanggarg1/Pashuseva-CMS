-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'CARD';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "invoiceNumber" TEXT;

-- CreateTable
CREATE TABLE "Payment" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "referenceNumber" TEXT,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "reversesPaymentId" INTEGER,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "Payment_createdById_idx" ON "Payment"("createdById");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reversesPaymentId_fkey" FOREIGN KEY ("reversesPaymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Data backfill: every existing order gets an invoice number, matching the same
-- per-year sequential pattern nextOrderNumber() already uses for orderNumber
-- (INV-<year>-<6-digit sequence within that year>, ordered chronologically).
WITH numbered AS (
  SELECT "id",
         EXTRACT(YEAR FROM "orderDate")::int AS yr,
         ROW_NUMBER() OVER (PARTITION BY EXTRACT(YEAR FROM "orderDate") ORDER BY "orderDate") AS seq
  FROM "Order"
)
UPDATE "Order" o
SET "invoiceNumber" = 'INV-' || numbered.yr || '-' || LPAD(numbered.seq::text, 6, '0')
FROM numbered
WHERE o."id" = numbered."id";

-- Now safe to enforce uniqueness (every row has a value).
CREATE UNIQUE INDEX "Order_invoiceNumber_key" ON "Order"("invoiceNumber");

-- Data backfill: orders that were already manually marked PAID under the old bare
-- status dropdown (Phase 6) get one backfilled Payment row for their full total, so
-- the new SUM(payments)-derived paymentStatus stays PAID instead of silently
-- reverting to Unpaid for pre-existing data. No PARTIAL orders existed at migration
-- time, so there's no partial-amount guess to make here.
INSERT INTO "Payment" ("orderId", "amount", "method", "notes", "createdById", "paymentDate", "createdAt")
SELECT "id", "total", "paymentMethod",
       'Backfilled — migrated from manual payment status at Phase 13 rollout',
       "createdById", "orderDate", CURRENT_TIMESTAMP
FROM "Order"
WHERE "paymentStatus" = 'PAID';
