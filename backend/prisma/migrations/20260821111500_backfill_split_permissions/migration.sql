-- The prior Manager permission backfill (20260821090000) ran before customer:delete
-- and product:deactivate existed. Now that the deactivate/reactivate routes move
-- from customer:update/product:update onto these new, split-out permissions, every
-- already-backfilled Manager needs them too — otherwise this ships as a silent
-- regression (an existing Manager who could deactivate a customer/product yesterday
-- suddenly can't). Not backfilling employee:manage-permissions — that one is
-- deliberately never automatic, per the Phase 15 addendum decision.
INSERT INTO "UserPermission" ("userId", "permission", "createdAt", "updatedAt")
SELECT u.id, p.permission, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User" u
CROSS JOIN (VALUES ('customer:delete'), ('product:deactivate')) AS p(permission)
WHERE u.role = 'MANAGER'
ON CONFLICT ("userId", "permission") DO NOTHING;
