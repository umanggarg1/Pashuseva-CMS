# Phase 11 — Advanced Customer & Order Management

## Status: done (2026-08-20)

Spec pasted 2026-08-20, following the deferral of the Notifications phase
(`PHASE10_TODO.md`). Cross-checked against the current codebase before writing this —
several items are already built (some spec sections describe what already exists, not
new work), one item directly **conflicts** with an explicit decision made earlier in
this project, and one real bug was found while checking. None of this has been
implemented yet — curation only, per this turn's request.

## Already built — no new work

- **Order cancellation** (§10): `CancelOrderDialog` on `OrderDetail.tsx`, reason
  required, restores stock via `order.service.ts`'s `cancel()`. The spec's mockup adds
  a separate optional "Note" field alongside "Reason" — small, optional UI addition if
  wanted, not a new feature.
- **Customer notes** (§11) and **Order notes** (§12): both already exist as separate
  panels (`CustomerDetail.tsx`'s `NotesPanel`, `OrderDetail.tsx`'s `NotesPanel`), each
  recording note/createdBy/createdAt exactly as specified.
- **Assigned employee on Order** (§13): already shown and editable
  (`AssignedEmployeeRow` on `OrderDetail.tsx`), gated to Admin/Manager.
- **Duplicate customer detection** (§16): already built — `AddCustomerDialog`'s
  debounced phone lookup, "Use Existing Customer" / "Create Anyway". §17 (merge) is
  explicitly out of scope per the spec itself.
- **Create new customer during order creation** (§5): already built (the Cross-Cutting
  UX Upgrade — inline `AddCustomerDialog` inside `CreateOrder.tsx`, auto-selects the
  new customer, no page navigation).
- **Product search suggestions while creating orders** (§6): already built (debounced
  product search in `CreateOrder.tsx`, matches name/SKU).
- **Delivery inside Order Details, no separate module** (§9): fully built in Phase 7 —
  Change Status, Add Location Update, delivery timeline/history. Nothing new here.
- **Reorder** (§4, customer-level): the underlying action already exists
  (`POST /orders/:id/reorder`, currently exposed as a button on `OrderDetail.tsx`). New
  work is only "expose it from Customer Detail's order history too" (see below).
- **Inventory integration** (Order Created → Stock Reserved, Cancelled → Released,
  Dispatched → Reduced): already covered by the existing "decrement at creation,
  restore on cancel" model — see `PHASE8_TODO.md`'s "no separate Reserved state"
  decision, reaffirmed rather than revisited here.

## Real bug found while checking this spec — fix regardless of the rest of this phase

`CustomerDetail.tsx`'s Total Purchases / Pending / Delivered stat cards compare
`o.deliveryStatus === 'Delivered'` — the actual enum values are
`NOT_DISPATCHED`/`DISPATCHED`/`IN_TRANSIT`/`DELIVERED` (upper snake case). This
condition can never match, so **Delivered Orders always shows 0, Total Purchases
always shows ₹0, and Pending Orders always equals Total Orders**, on every customer,
right now. Trivial fix, high value — worth doing standalone rather than bundled
into a larger Phase 11 pass. While fixing it, also apply the same
`salesEligibleFilter`-equivalent rule from `orderMetrics.ts` (Phase 9) so "Total
Purchases" excludes cancelled orders, consistent with how "Sales" is defined
everywhere else in the app.

## Conflict to resolve before building §8 (Order Status Rules)

This spec's §8 asks for backend-enforced forward-only order-status transitions again
(`Pending → Confirmed → Processing → Dispatched → Delivered`, cancellation only from
Pending/Confirmed/Processing, no `Delivered → Pending` without an "authorized
correction"). **This directly reverses an explicit decision made earlier in this same
project**: the "manual status" request that removed all transition restrictions from
both `orderStatus` and `deliveryStatus`, specifically so a status could be freely
reverted and `IN_TRANSIT` re-logged with new locations. Re-adding validation now would
break that already-shipped, already-used behavior.

**Resolved**: option (b) — forward-only validation reintroduced for both `orderStatus`
and `deliveryStatus`, with a full override for ADMIN/MANAGER (`assertNotBackward` in
`order.service.ts`). "Forward" means the target stage's index in the sequence is `>=`
the current stage's index — not strictly adjacent-only, and explicitly *not* blocking
staying at the same stage, so Phase 7's most-valued behavior (re-logging `IN_TRANSIT`
multiple times with a new location) still works for every role, Employee included.
Only genuine backward moves are blocked for non-Admin/Manager. Frontend pickers
(`OrderDetail.tsx`'s order-status Select and `ChangeDeliveryStatusDialog`) filter their
options to match, so Employees don't see choices the backend would reject.
Live-verified: Employee blocked going CONFIRMED→PENDING and DISPATCHED→NOT_DISPATCHED
(400, with the ask-a-Manager message), allowed same-stage re-select and any forward
move; Admin successfully overrode both backward moves.

## New work — all done

1. **DONE — Customer order history section** (§1). New `OrderHistoryCard` on
   `CustomerDetail.tsx` — date now shown, each row links to Order Detail, plus a
   "View All Orders (N) →" link to `/orders?customerId=X` (Orders.tsx now reads
   `customerId` from the URL and shows a "Filtered to customer: X · Clear" chip).
2. **DONE — Total Purchases stat-card bug fixed** as part of rebuilding that section:
   compares against `'DELIVERED'` now, added a Cancelled bucket, and Total Purchases
   excludes cancelled orders (mirroring `orderMetrics.ts`'s sales definition).
3. **DONE — Create Order from Customer Detail** (§3). `[+ Create Order]` button
   (permission- and active-status-gated) navigates to `/orders/new?customerId=X`;
   `CreateOrder.tsx` fetches and preselects that customer once on mount.
4. **DONE — Reorder from Customer Detail's order history** (§4). Reorder button per
   row in `OrderHistoryCard`, same `POST /orders/:id/reorder` endpoint.
5. **DONE — Duplicate Order** (§18). New button on `OrderDetail.tsx` navigates to
   `/orders/new` with router state (`DuplicateOrderState`: customerId + item
   productId/quantity pairs); `CreateOrder.tsx` re-fetches each product live (current
   price/stock, never the source order's snapshot — matching Reorder's own rule) and
   prefills the still-fully-editable form, with a banner explaining it's a duplicate to
   review.
6. **DONE — Employee assignment change directly on Customer Detail** (§14). New
   `AssignedEmployeeRow` component (mirrors `OrderDetail.tsx`'s existing one), calls
   `/assign` or `/reassign` depending on whether the customer already has an owner.
7. **DONE — Customer search improvements** (§15). `customer.service.ts`'s search `OR`
   clause now also matches city/district/pincode via the address relation.
8. **DONE — Print Order** (§19). `[Print]` button calling `window.print()`; a
   `.print-only` block on `OrderDetail.tsx` (Pashuseva header, order #, customer,
   items table, total, delivery status) is the only thing visible when printing —
   `tailwind.css` gained a `@media print` rule hiding `.print-hide` (Sidebar, Navbar)
   and showing `.print-only`.
9. **DONE — Order editing, line items** (§7). New `EditOrderItemsDialog` on
   `OrderDetail.tsx` — add/remove products, change quantities, reuses
   `PATCH /orders/:id`'s existing server-side re-resolution of current prices/stock.
   Gated by the same pre-dispatch `canEditOrCancel` rule as Cancel Order. As planned,
   §7's "Customer information" editing was **not** duplicated into Order Details —
   stays on Customer Detail, reached via the existing "View Full Customer Profile →"
   link.

## Permission-granularity decisions (flagging, not deciding)

Spec §20 lists `order:assign`/`customer:assign` (new) and
`delivery:update_status`/`delivery:add_location` (a split of the existing single
`delivery:update`, revisiting the exact question already raised and resolved in
`PHASE7_TODO.md` — kept as one permission there since nothing indicated the extra
granularity was needed). Recommend: keep assignment changes role-gated
(Admin/Manager only, matching how `checkAccess`/assignment already work — assignment
is inherently a manager-level action, not something an Employee is ever granted) rather
than adding two more permissions nobody's asked to grant independently; keep
`delivery:update` as one permission, reaffirming Phase 7's decision. Open to revisiting
either if there's a concrete case for the split.

## Explicitly not doing

Customer merge (§17, spec's own call — "just detect possible duplicates" is already
done); a full accounting/invoice system (§19, spec's own call — printable order, not
an invoice engine); anything from the deferred Phase 10 (notifications tied to
assignment/order events — §14's "Rahul receives a notification" framing is Phase
10 territory, not this phase's); the optional Cancel-Order "Note" field (still just
Reason, matching the pre-existing dialog — not requested as must-have); the
`order:assign`/`customer:assign`/`delivery:update_status`/`delivery:add_location`
permission split (kept as role-gating / single `delivery:update`, per the
recommendation above — not built).

## Verified

Backend `tsc`/`eslint` clean, frontend `tsc`/`eslint`/`vite build` clean. Live-tested
against the real database: forward-only status validation for both `orderStatus` and
`deliveryStatus` (Employee blocked backward on both fields, allowed forward and
same-stage re-select; Admin override confirmed on both), customer search by city,
customer order-history data shape, product/customer fetch shapes used by the
Create-Order-from-Customer and Duplicate-Order prefill paths, and the assign/reassign
endpoints `AssignedEmployeeRow` uses. All test data (a throwaway employee account, a
temporary customer assignment, an order's status) was reset back afterward.
