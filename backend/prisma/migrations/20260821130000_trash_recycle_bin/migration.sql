-- Phase 3 addendum: Trash / Recycle Bin. Soft-delete columns on User, Customer,
-- Order, Product. All nullable, all additive — nothing here changes existing rows'
-- visibility (deletedAt IS NULL for every current row, so every existing query that
-- gets a new "exclude trashed" filter still returns exactly what it did before).

ALTER TABLE "User" ADD COLUMN "deletedById" INTEGER;
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "deletionExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "purgedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD CONSTRAINT "User_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Customer" ADD COLUMN "deletedById" INTEGER;
ALTER TABLE "Customer" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN "deletionExpiresAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN "purgedAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Customer_deletedAt_idx" ON "Customer"("deletedAt");

ALTER TABLE "Order" ADD COLUMN "deletedById" INTEGER;
ALTER TABLE "Order" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "deletionExpiresAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "purgedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD CONSTRAINT "Order_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Order_deletedAt_idx" ON "Order"("deletedAt");

ALTER TABLE "Product" ADD COLUMN "deletedById" INTEGER;
ALTER TABLE "Product" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Product" ADD COLUMN "deletionExpiresAt" TIMESTAMP(3);
ALTER TABLE "Product" ADD CONSTRAINT "Product_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Product_deletedAt_idx" ON "Product"("deletedAt");
