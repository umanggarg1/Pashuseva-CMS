-- Phase 29: the Trash recovery window went from 10 to 30 days
-- (TRASH_RETENTION_DAYS in backend/src/utils/trash.ts). Data-only, like the earlier
-- permission backfills: every item that is in Trash right now (deleted, not yet
-- purged) gets the new window too, measured from when it was deleted — otherwise
-- items deleted before the release would still disappear after 10 days while the
-- UI says 30.
--
-- Restored items have deletedAt NULL and are untouched. Product has no purgedAt
-- (purging deletes the row), so any remaining trashed Product is still in Trash.

UPDATE "Customer"
SET "deletionExpiresAt" = "deletedAt" + INTERVAL '30 days'
WHERE "deletedAt" IS NOT NULL AND "purgedAt" IS NULL;

UPDATE "Order"
SET "deletionExpiresAt" = "deletedAt" + INTERVAL '30 days'
WHERE "deletedAt" IS NOT NULL AND "purgedAt" IS NULL;

UPDATE "User"
SET "deletionExpiresAt" = "deletedAt" + INTERVAL '30 days'
WHERE "deletedAt" IS NOT NULL AND "purgedAt" IS NULL;

UPDATE "Product"
SET "deletionExpiresAt" = "deletedAt" + INTERVAL '30 days'
WHERE "deletedAt" IS NOT NULL;
