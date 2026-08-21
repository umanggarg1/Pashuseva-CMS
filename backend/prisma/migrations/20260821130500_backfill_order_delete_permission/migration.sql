-- Same reasoning as the two prior permission backfills this session: every existing
-- Manager was already granted the full business-permission list before order:delete
-- existed, so without this they'd silently lose the ability to delete orders the
-- moment that route ships gated on it.
INSERT INTO "UserPermission" ("userId", "permission", "createdAt", "updatedAt")
SELECT u.id, 'order:delete', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User" u
WHERE u.role = 'MANAGER'
ON CONFLICT ("userId", "permission") DO NOTHING;
