-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "createdById" INTEGER,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "CustomerAddress" ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'India';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "createdById" INTEGER,
ADD COLUMN     "minimumStock" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "unit" TEXT;

-- AlterTable
ALTER TABLE "ProductCategory" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ProductActivity" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "activity" TEXT NOT NULL,
    "metadata" JSONB,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductActivity_productId_idx" ON "ProductActivity"("productId");

-- CreateIndex
CREATE INDEX "ProductActivity_createdById_idx" ON "ProductActivity"("createdById");

-- CreateIndex
CREATE INDEX "Customer_createdById_idx" ON "Customer"("createdById");

-- CreateIndex
CREATE INDEX "Product_createdById_idx" ON "Product"("createdById");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductActivity" ADD CONSTRAINT "ProductActivity_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductActivity" ADD CONSTRAINT "ProductActivity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
