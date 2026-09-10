-- Phase 21 addendum: the bulk "Download Orders" export moved from being gated on
-- order:view to its own order:export permission. Same reasoning as the earlier
-- permission backfills (20260821130500_backfill_order_delete_permission): every
-- existing Manager was granted the full business-permission list before
-- order:export existed, so without this they'd silently lose the ability to
-- download the orders report the moment the routes ship gated on it.
--
-- Managers only, matching the order:delete backfill precedent. Admin bypasses
-- authorize() unconditionally. Employees never had an explicit grant for this
-- (it rode along on order:view), so they now need one added deliberately in the
-- permission picker -- which is the point of the change.
INSERT INTO "UserPermission" ("userId", "permission", "createdAt", "updatedAt")
SELECT u.id, 'order:export', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User" u
WHERE u.role = 'MANAGER'
ON CONFLICT ("userId", "permission") DO NOTHING;
