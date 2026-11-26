-- Phase 32 D6 (user-approved 2026-11-26): record WHEN an Admin resolved an UNKNOWN
-- WhatsApp message and their mandatory reason, without overwriting the original
-- error text (lastError) or send time (sentAt).
--
-- ADDITIVE ONLY: exactly two new nullable columns on "OutboundMessage". No default,
-- no backfill, no index, nothing renamed or dropped; every existing row and every
-- audit-log / activity record is left untouched (both columns are NULL for them).
-- All-or-nothing (BEGIN/COMMIT), like the other Phase 32 migrations.

BEGIN;

ALTER TABLE "OutboundMessage"
  ADD COLUMN "resolvedAt" TIMESTAMP(3),
  ADD COLUMN "resolutionNote" TEXT;

COMMIT;
