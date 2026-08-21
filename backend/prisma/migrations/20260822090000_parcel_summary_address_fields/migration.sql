-- Rural-delivery fields for the Parcel Summary label (Village / Post Office / Father's
-- or Husband's Name), snapshotted onto orders the same way every other address field
-- already is here.
ALTER TABLE "CustomerAddress" ADD COLUMN "guardianName" TEXT;
ALTER TABLE "CustomerAddress" ADD COLUMN "village" TEXT;
ALTER TABLE "CustomerAddress" ADD COLUMN "post" TEXT;

ALTER TABLE "OrderAddress" ADD COLUMN "guardianName" TEXT;
ALTER TABLE "OrderAddress" ADD COLUMN "village" TEXT;
ALTER TABLE "OrderAddress" ADD COLUMN "post" TEXT;
