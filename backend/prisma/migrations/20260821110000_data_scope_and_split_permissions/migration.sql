-- Phase 15 addendum: Data Scope (All vs. Assigned per module), admin-configurable
-- per Manager/Employee. Admin's scope stays hardcoded in application code, never
-- stored. No backfill — null means "use the pre-addendum default behavior", so every
-- existing account's actual access is unchanged by this migration.

CREATE TYPE "DataScope" AS ENUM ('ALL', 'ASSIGNED');

ALTER TABLE "User" ADD COLUMN "customerDataScope" "DataScope";
ALTER TABLE "User" ADD COLUMN "orderDataScope" "DataScope";
