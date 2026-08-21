-- Reverts 20260822090000_parcel_summary_address_fields — Father's/Husband's Name,
-- Village, and Post turned out not to belong on the Edit Customer form; removed
-- entirely rather than left as unreachable columns.
ALTER TABLE "CustomerAddress" DROP COLUMN "guardianName";
ALTER TABLE "CustomerAddress" DROP COLUMN "village";
ALTER TABLE "CustomerAddress" DROP COLUMN "post";

ALTER TABLE "OrderAddress" DROP COLUMN "guardianName";
ALTER TABLE "OrderAddress" DROP COLUMN "village";
ALTER TABLE "OrderAddress" DROP COLUMN "post";
