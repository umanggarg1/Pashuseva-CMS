-- Phase 32 C5 (PHASE32_TODO.md §18 C5, decision Q9): grant the new message:resend
-- permission ONCE to every existing Manager and Employee who can already update
-- orders (order:update) — "anyone who can update orders can resend an order's
-- WhatsApp message". Same pattern as 20260910100000_backfill_order_export_permission.
--
-- message:manage (the Admin Messaging page) is deliberately NOT granted to anyone:
-- it is Admin-only by default and Admin bypasses authorize() unconditionally.
--
-- DATA-ONLY and idempotent: ON CONFLICT on the existing unique (userId, permission)
-- means re-running it can never create a duplicate grant; nothing is removed or
-- changed. All-or-nothing (BEGIN/COMMIT), like the Phase 32 schema migration.

BEGIN;

INSERT INTO "UserPermission" ("userId", "permission", "createdAt", "updatedAt")
SELECT u.id, 'message:resend', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User" u
WHERE u.role IN ('MANAGER', 'EMPLOYEE')
  AND EXISTS (
    SELECT 1 FROM "UserPermission" p
    WHERE p."userId" = u.id AND p.permission = 'order:update'
  )
ON CONFLICT ("userId", "permission") DO NOTHING;

COMMIT;
