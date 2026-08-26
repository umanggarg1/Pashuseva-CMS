# Phase 17 — Delivery Status Drives Order Status (Completion Record)

Retroactive record — this was implemented directly in-session (code comments already
say "Phase 17"), without a TODO file written first. Documented here now to keep the
PHASE*_TODO.md numbering consistent with what the code actually references.

## What was built

- `DeliveryStatus` becomes the source of truth for normal delivery progression;
  `OrderStatus` is auto-synced by the app, never independently set once dispatched.
- Mapping: Dispatched→Confirmed, In Transit→Processing, Out for Delivery→Out for
  Delivery, Delivered→Delivered, Return Pending/Return In Transit/Returned→Cancelled.
  Lost/Damaged leave Order Status untouched (needs human judgment).
- Cancelling an already-dispatched order — previously blocked outright — is now
  allowed: starts a return flow (Delivery Status → Return Pending) instead of
  restoring stock immediately. Stock is only restored once Delivery Status reaches
  Returned.
- Schema: `OrderStatus` drops `COMPLETED` in favor of `OUT_FOR_DELIVERY`/`DELIVERED`
  (existing `COMPLETED` orders migrated to `DELIVERED`); `DeliveryStatus` gains
  `OUT_FOR_DELIVERY` plus the return/exception states (`RETURN_PENDING`,
  `RETURN_IN_TRANSIT`, `RETURNED`, `LOST`, `DAMAGED`).
- Manual `PATCH /orders/:id/status` restricted to Pending/Confirmed/Processing only.

## Status: Done

Commits `c88f09a` (main implementation) and `072d0a5` (fixed the Change Status
button disappearing after cancelling a dispatched order — `canChangeStatus` was
still gated on `orderStatus !== 'CANCELLED'`, left over from before mid-flight
cancellation existed). Verified live end-to-end, both locally and in production.
