-- Auto-generated SKU + structured weight feature: adds net weight (weightValue/
-- weightUnit) to Product, and converts the free-text `unit` column (packaging type)
-- into a fixed enum. Existing `unit` values in this database are exactly 'Packet' and
-- 'Bag' (verified before writing this migration) plus NULL, so the CASE mapping below
-- is lossless for all current data.

CREATE TYPE "WeightUnit" AS ENUM ('G', 'KG', 'ML', 'L');
CREATE TYPE "PackagingUnit" AS ENUM ('PIECE', 'PACKET', 'BOX', 'BAG', 'BOTTLE');

ALTER TABLE "Product" ADD COLUMN "weightValue" DOUBLE PRECISION;
ALTER TABLE "Product" ADD COLUMN "weightUnit" "WeightUnit";

ALTER TABLE "Product" ADD COLUMN "unit_new" "PackagingUnit";
UPDATE "Product" SET "unit_new" = CASE "unit"
  WHEN 'Piece' THEN 'PIECE'
  WHEN 'Packet' THEN 'PACKET'
  WHEN 'Box' THEN 'BOX'
  WHEN 'Bag' THEN 'BAG'
  WHEN 'Bottle' THEN 'BOTTLE'
  ELSE NULL
END::"PackagingUnit";
ALTER TABLE "Product" DROP COLUMN "unit";
ALTER TABLE "Product" RENAME COLUMN "unit_new" TO "unit";
