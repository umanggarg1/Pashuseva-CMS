# Phase 7 — Delivery Tracking & Status Management (Final)

Curated from a pasted "Final Phase 7" spec (2026-08-19). Cross-checked against what's
already built (the "Order Details Redesign & Delivery Tracking History" work, plus the
"manual status selection" pass done immediately before this). Nothing below deletes or
replaces existing delivery data — `Order.deliveryStatus` and the `DeliveryTracking`
table stay exactly as they are; every item here is additive or a permission/UX fix.

**Process note:** todo items are implemented one at a time, only after the user
explicitly says to start that item. Do not build ahead.

## Already satisfied — no action needed

The spec's core architectural stance is "no separate Delivery module, everything lives
on Order Details" — that's already how this app is built, not a new direction:

- No `/deliveries` route, no Delivery table, no Delivery nav item. Order Details
  (`/orders/:orderNumber`) is the only place delivery is managed.
- `DeliveryTracking` (orderId, status, location, note, updatedById, createdAt) is
  already the append-only "don't overwrite, keep history" table the spec calls
  `order_delivery_history` — same shape, no rename needed.
- Delivery Timeline showing full ordered history (status + location + time + who) is
  already rendered on Order Details from `GET /orders/:id/tracking`.
- Manual status selection (any of NOT_DISPATCHED/DISPATCHED/IN_TRANSIT/DELIVERED, any
  direction, repeatable) already shipped in the previous pass — covers "transit can be
  logged two or more times" and "user can revert back."
- Per-status location field with contextual label (`STATUS_FIELD_CONFIG` — "Dispatch
  Location" / "Current Location" / "Delivered At") already exists in
  `ChangeDeliveryStatusDialog`.

## Status: items 1-3 done (2026-08-19), item 4 skipped by design

## Curated todo — genuinely new/useful

1. **DONE — separate "Add Location Update" action.** `AddLocationUpdateDialog` in
   `OrderDetail.tsx`, shown next to "Change Status" only when `deliveryStatus ===
   'IN_TRANSIT'`. Location + Note only, posts to the same `PATCH
   /orders/:id/delivery-status` with `deliveryStatus` held at `IN_TRANSIT`. No schema
   change, as planned.

2. **DONE — "Received By" field for DELIVERED.** Went with option (b): added a real
   `receivedBy` column on `DeliveryTracking` (migration
   `20260819124807_add_delivery_received_by`), a dedicated input shown only when the
   picked status is DELIVERED, and it now renders on the timeline entry.

3. **DONE — permission gating reconciled.** `PATCH /orders/:id/delivery-status` and the
   frontend's delivery-status controls (Change Status + Add Location Update) now both
   require `delivery:update` instead of `order:update`. Kept a single `delivery:update`
   permission covering both actions rather than splitting into
   `delivery:update_status`/`delivery:add_location` — no signal the user wanted that
   extra granularity, and one permission already does the job the spec was after
   (letting a Manager grant delivery-status rights independently of order-edit rights).

4. **SKIPPED — manual date/time entry for backdating.** Left as server-generated
   `createdAt` only; no override field added. Revisit if a real backdating need shows up.

## Explicitly not doing

- No separate Delivery table, delivery number, delivery partner, or proof-of-delivery
  attachment system — that was the earlier, fully-reverted Phase 7 module and is out of
  scope here by design.
- No renaming `DeliveryTracking` to `order_delivery_history` — same structure already,
  renaming is churn with no functional benefit.

## Addendum, 2026-08-20 — Article Number & Estimated Delivery Charges

**DONE.** Two optional fields added to `Order`, requested directly ("Add both fields
to Phase 7/Order Management"), not curated-then-deferred like the rest of this file —
implemented and verified the same session.

- **Article Number** — the courier-provided tracking/reference number. **Reused the
  existing unused `trackingNumber` column** (present on `Order` since the original
  Phase 6 schema, confirmed via a full codebase grep to be referenced by zero
  repository/service/controller/frontend code, and confirmed via the live database
  that 0 of 10 existing orders had it set) rather than adding a new column —
  semantically the same field, just renamed to `articleNumber` and finally wired up.
  Labeled **"Article Number (Tracking No.)"** everywhere it's shown, per explicit
  request, so the two names are visibly tied together. `courier` (the other unused
  sibling column from the same original schema) stays unused — out of scope here.
- **Estimated Delivery Charges** — a new nullable `Float` column (matching every other
  money field on `Order` — `subtotal`/`discount`/`shipping`/`total` are all `Float`;
  deliberately did **not** use `Decimal` as the spec suggested, since introducing it
  for one sibling field alone would mean different serialization/type handling for no
  practical benefit at this app's scale — flagged as a judgment call, not a silent
  override). **Verified live that it never enters the `total` calculation** — `total =
  subtotal - discount + shipping` (unchanged), confirmed via a real order where
  `estimatedDeliveryCharges: 180` left `total` at exactly `subtotal + shipping`.
- Both fields: optional at creation, editable afterward (inline edit UI on the
  Delivery card, same pattern as Expected Delivery Date), and **empty-string input
  normalizes to an explicit `null`** on save (not `0` for the charge field — a real
  edge case caught and fixed: converting the input to `Number()` client-side before
  sending would have turned "cleared" into "₹0", so the raw string is sent and the
  backend's `zod` preprocessing handles the null-vs-untouched distinction). A PATCH
  that omits the field entirely leaves the stored value untouched (Prisma ignores
  `undefined`); explicitly sending an empty value clears it to `null`.
- Migration `20260820072943_order_article_number_and_delivery_charges` (a
  drop-and-add, not a true rename, since Prisma doesn't detect column renames from a
  field-name change alone — safe because no data existed in the old column).
- Shown in `CreateOrder.tsx`'s new "Delivery Information" section and in
  `OrderDetail.tsx`'s Delivery card; **deliberately left off the printable order
  view** (`PrintableOrder`) for Estimated Delivery Charges specifically — that view is
  customer-facing and the field is explicitly internal-reference-only, so surfacing it
  there would risk a customer misreading it as an extra charge on top of the total.
  Article Number *is* shown on the printable view (a tracking number is normal to
  hand a customer).
- Activity log records both fields changing (`"Article number changed"` /
  `"Estimated delivery charges changed"`, old → new), matching every other tracked
  order field.

Live-verified end to end: create with both fields set, total unaffected; edit each
field independently; clear each to `null` via empty input (not `0`/`""`); patch an
unrelated field (discount) and confirm articleNumber/estimatedDeliveryCharges stay
untouched; activity log entries correct for every change. Test order cancelled
afterward. `tsc --noEmit`/`eslint` clean on both packages (0 errors, same
pre-existing warnings), `vite build` clean.
