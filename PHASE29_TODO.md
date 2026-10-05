# Phase 29 — Trash recovery window: 10 days → 30 days

**Status: implemented and verified locally 2026-10-05. Never run against production.
Not committed.**

- On a throwaway Docker Postgres (`crm-phase29-test`, `localhost:55432`):
  - **Migration + behaviour: 9/9.**
  - **Phase 27 Trash suite: 21/21** (expectation updated from 10 to 30 days left).
- `tsc` and ESLint clean (0 errors).

## The request, as given

Change the Trash window from 10 days to 30 days.

**Decision (asked):** items **already in Trash** get the new window too — expiry =
their deletion date + 30 days — not just items trashed after the release.

## What changes

| Piece | Change |
|---|---|
| `backend/src/utils/trash.ts` | `TRASH_RETENTION_DAYS` 10 → **30** (drives `computeDeletionExpiry`, so every new delete) |
| **Migration** `20261005120000_trash_retention_30_days` (data-only, like the earlier permission backfills) | Customer / Order / User: `deletionExpiresAt = deletedAt + 30 days` where in Trash and **not purged**. Product: same where `deletedAt` is set (purged products no longer exist). Restored items (`deletedAt` NULL) untouched |
| Audit reason for automatic purges (customer / order / product / user services) | `"10-day trash period expired"` → `` `${TRASH_RETENTION_DAYS}-day trash period expired` `` (= "30-day …"). Past log entries keep their original text |
| `frontend/src/lib/trash.ts` (new) | `TRASH_RETENTION_DAYS = 30`, kept in sync with the backend by hand (same as parcelSettings) |
| UI text (all now from the constant) | Trash banner ("…within the next 30 days…"); "Move to Trash" confirmations on Customer, Order, Product and Employee ("…restore it within 30 days"); Delete Permanently warning ("The 30-day recovery period will be skipped") |
| Comments | `index.ts`, `trash.schema.ts`, `Sidebar.tsx`, page comments no longer hard-code 10 |

**Unchanged:** the purge sweep still runs hourly; Trash stays Admin-only; nothing else
about delete / restore / purge.

## Deployment note

The data migration must be **applied to production** with `prisma migrate deploy`.
**Confirmed (Render dashboard, 2026-10-05):** the backend's **Start Command** is

```
(npm run prisma:deploy || (sleep 5 && npm run prisma:deploy) || (sleep 10 && npm run prisma:deploy)) && npm start
```

so `prisma migrate deploy` runs automatically on every deploy, retried twice, and the
server only starts if it succeeds. The Build Command (`npm install --include=dev &&
npm run prisma:generate && npm run build`) does not migrate.

Deployment success still isn't the same as "migration applied" — confirm it
explicitly after the push: Render's deploy log should show
`Applying migration 20261005120000_trash_retention_30_days`, or run the read-only
`npx prisma migrate status` against production if authorized.

## TODO checklist

- [x] Backend constant + audit reason
- [x] Data migration for items already in Trash
- [x] Frontend constant + all user-facing texts
- [x] `tsc` / ESLint
- [x] Local verification — **9/9** (the migration applied exactly as production would:
      DB migrated without it, old-style data seeded, then the new migration applied):
  - [x] M1 trashed customer / order / product / employee: expiry → deletedAt + **30** (was +10)
  - [x] M2 an already-purged customer is untouched
  - [x] M3 a restored customer is untouched
  - [x] N1 a new deletion expires at +30 days
  - [x] N2 Trash detail shows **30 days left** for it
  - [x] N3 the migrated order deleted 5 days ago now shows **25 days left**
  - [x] N4 the "Deleted Customer" audit entry records the 30-day expiry
  - [x] P1 the hourly sweep purges only the truly expired item (a 9-day-old product survives); reason "30-day trash period expired"
  - [x] P2 the Trash list shows the 5 remaining items
- [x] Regression: Phase 27 Trash suite 21/21
- [ ] Release + production check
