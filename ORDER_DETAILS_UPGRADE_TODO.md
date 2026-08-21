# Order Details Upgrade — TODO

Keeps the existing app structure (Orders → List / Search / Filters / Create / Details)
and rebuilds the Order Details page specifically: reorganized layout, order-number URLs,
and — the centerpiece — a real delivery tracking history (status + location + note +
who + when per update), not just a single `deliveryStatus` field. Full request preserved
in the conversation; this file is the working checklist.

## Resolved decisions

- **No schema migration needed for tracking history.** `DeliveryTracking` already exists
  in `schema.prisma` since Phase 2 — `orderId`, `status`, `location`, `note`,
  `updatedById`, `createdAt` — and both relation sides (`Order.tracking`,
  `User.DeliveryTrackingUpdated`) are already wired and migrated. It's just never been
  used by any repository/service/controller. This is exactly the "status +
  currentLocation + trackingHistory" model requested — building repository/service/
  controller/route layers on top of it is the whole task, not a new table.
- **"Current location"** is derived as the most recent `DeliveryTracking` row's
  `location` — not a separate `Order.currentLocation` column (would just duplicate the
  latest history row).
- **Forward-only sequence enforcement, added now**: today's `updateDeliveryStatus`
  accepts any status from any other with zero validation (confirmed by reading the
  service — the frontend just happens to only ever offer the "next" button). Since we're
  building a real "Change Status" picker, add a real guard: the new status must be
  exactly the next stage in `NOT_DISPATCHED → DISPATCHED → IN_TRANSIT → DELIVERED`, no
  skips, no going backward.
- **No custom timestamp entry in v1.** The per-status forms in the request show a
  date/time field ("Dispatch Date & Time"), but every tracking entry uses the server's
  `now()` — letting users backdate/future-date delivery events is exactly the kind of
  scope the user themselves flagged as "later, not first version" (proof/photo,
  signature, OTP). Keeps the audit trail trustworthy.
- **"Received By" folds into the note text** for the Delivered form rather than a new
  column — e.g. note becomes `"Delivered to Rajesh Kumar — left at front door"`. Same
  reasoning: avoid growing the schema for v1.
- **Order-number URLs**: `/orders/:orderNumber` (e.g. `/orders/ORD-2026-000006`).
  Existing sub-resource endpoints (notes/activity/tracking/status updates) stay keyed by
  the numeric `id` internally — once the detail page resolves the order by number, it
  has the numeric id for everything else. New: `GET /orders/number/:orderNumber` +
  `orderService.getByOrderNumber()`, which re-implements `checkOrderAccess`'s exact
  scoping logic inline (Admin all / Manager team / Employee own, derived from the
  order's customer's live assignment) rather than adapting the id-based middleware to
  also accept strings — keeps the existing numeric-id path completely untouched.
- **Assigned Employee becomes editable** via `PATCH /orders/:id` (new
  `assignedEmployeeId` field) — validated against a real Employee, `order:update`
  permission-gated like other edits. This does **not** change the resolved access-control
  rule from Phase 6 (`Order.assignedEmployeeId` is display/reporting only; who can
  *view* the order still derives from the customer's live assignment) — it just makes
  the display/reporting field editable for accountability, which it wasn't before.
- **Expected delivery date becomes editable** via the same `PATCH /orders/:id`
  (`Order.expectedDelivery` already exists on the model, unused until now).
- **Customer phone/address editing stays on the Customer Detail page.** The request's
  own "key decision" section says "Pages → full information and management" — so the
  Order Details customer card links to `/customers/:id` ("View Full Customer Profile →")
  rather than duplicating `CustomerDetail.tsx`'s edit forms inline. Avoids maintaining
  two copies of customer-editing logic that could drift apart.
- **Order items/quantity inline editing is deferred again** (same known scope cut as
  Phase 6, restated here rather than silently dropped) — a real item editor would
  essentially duplicate `CreateOrder.tsx`'s product builder in an edit mode. The
  request's centerpiece and most-detailed spec is delivery tracking; that's where this
  pass's effort goes.
- **Layout**: header (back link, order number, customer name + total, action buttons) →
  order/delivery status strip → two-column Customer + Order Summary cards → Order Items
  table → Delivery card (status, current location, last updated, Change Status, tracking
  timeline) → Order Notes → Activity. Matches the requested structure; nothing from the
  existing page's functionality is removed, only reorganized.

## 1. Backend — order lookup by order number — DONE

- [x] `order.repository.ts` — `findByOrderNumber(orderNumber)`.
- [x] `order.service.ts` — `getByOrderNumber()` + `assertOrderAccessible()` helper
      (same rule as `checkOrderAccess`, applied inline).
- [x] `order.schema.ts` — `orderNumberParamSchema`.
- [x] `GET /orders/number/:orderNumber` — registered **before** `GET /:id` (otherwise
      Express's numeric `:id` param would swallow "number" as a literal id value and
      the route would never be reached — caught this before it shipped, not after).
- [x] Verified live: lookup by real order number → `200` with full order; nonexistent
      order number → `404`; numeric `/orders/:id` route confirmed still working
      unchanged.

## 2. Backend — delivery tracking history — DONE

- [x] `order.repository.ts` — `findTracking(orderId)` (ascending by `createdAt`), and
      `updateDeliveryStatus()` reworked into a `prisma.$transaction` that updates
      `Order.deliveryStatus` (+ `deliveredDate` when target is `DELIVERED`) **and**
      inserts a `DeliveryTracking` row in the same call.
- [x] `order.schema.ts` — `updateDeliveryStatusSchema` gained optional `location`/`note`.
- [x] `order.service.ts` — added the forward-only sequence guard (`DELIVERY_SEQUENCE`
      array, rejects anything that isn't exactly current+1).
- [x] `GET /orders/:id/tracking` route added.
- [x] Verified live, full sequence: skip-to-DELIVERED from NOT_DISPATCHED correctly
      rejected (`400`, readable error naming the full sequence); then walked
      DISPATCHED (location "Narnaul, Haryana") → IN_TRANSIT (location "Rewari,
      Haryana") → DELIVERED, each with a note; `GET /orders/:id/tracking` returned all
      3 entries in order with correct location/note/updatedBy/timestamp;
      `Order.deliveredDate` confirmed auto-set on reaching DELIVERED.

## 3. Backend — assigned employee + expected delivery date — DONE

- [x] `order.schema.ts` — `updateOrderSchema` gained optional `assignedEmployeeId`
      (validated against a real Employee in the service) and `expectedDelivery`.
- [x] `order.service.ts` — `update()` refined so only the *core* edit (items/discount/
      deliveryCharge/address) is dispatch-gated; assignedEmployeeId/expectedDelivery
      are administrative/tracking fields that stay editable after dispatch (arguably
      more useful then — reassigning an in-transit order, or correcting an expected
      date after a delay). Activity recorded for both when changed.
- [x] Verified live: reassigned an already-**DELIVERED** order's employee and expected
      delivery date — both succeeded (correctly not blocked, since neither is a core
      edit); confirmed both recorded in the activity log; confirmed a genuine core edit
      (items) on that same order is still correctly rejected with the dispatch-gate
      error — proves the split is working, not just permissive.

## 4. Frontend — order-number routing — DONE

- [x] `App.tsx` — route param renamed `/orders/:orderNumber`.
- [x] `OrderDetail.tsx` — fetches via `GET /orders/number/:orderNumber`; every
      sub-resource call (notes/activity/tracking/status/payment/cancel/reorder/
      assigned-employee/expected-delivery) uses the fetched order's numeric `id`
      (`enabled: !!id` on the dependent queries so they don't fire before the order
      loads).
- [x] Updated every navigation call site that linked/navigated by numeric id:
      `Orders.tsx`'s list links (both desktop rows), `CreateOrder.tsx`'s post-create
      `navigate()`, `OrderDetail.tsx`'s post-reorder `navigate()` — all now use
      `order.orderNumber`.

## 5. Frontend — Order Details page redesign — DONE

- [x] Header: back link, `#ORD-...`, customer name + "Created {date}", action buttons.
- [x] Order status strip at the top (existing stepper, restyled).
- [x] Two-column Customer card (name, phones, address, customer-notes preview, "View
      Full Customer Profile →" to `/customers/:id`) + Order Summary card (item count,
      subtotal/discount/delivery/total, payment method + status, assigned employee,
      created by).
- [x] Order Items table — added the Discount column (the data already existed per
      item, just wasn't rendered).
- [x] Order Notes and Activity cards — unchanged functionality, now sourced from the
      order's resolved numeric id instead of the URL param.

## 6. Frontend — Delivery section rebuild — DONE

- [x] `DeliveryCard` — current status, current location (derived from the latest
      `DeliveryTracking` entry, not a separate stored field), last updated + by.
- [x] `ChangeDeliveryStatusDialog` — target status is always exactly "next stage"
      (matches the backend's forward-only enforcement, so there's no dropdown of
      arbitrary statuses to accidentally pick a skip/backward transition from).
      Per-status field config (`STATUS_FIELD_CONFIG`): Dispatched/In Transit require a
      location, Delivered's location is optional and its note field is placeholder-
      guided toward "e.g. Delivered to Rajesh Kumar" (received-by folded into the note,
      per the resolved decision — no new column).
- [x] Delivery timeline renders every tracking entry (done markers) plus one greyed-out
      pending marker for the next stage, each with location/note/updated-by/timestamp.
- [x] `AssignedEmployeeRow` — inline view→edit→save, gated to Admin/Manager (`/users`
      itself is Admin/Manager-only on the backend, so an Employee couldn't populate
      this picker even if the row were shown — gating the UI to match avoids showing a
      control that would just fail to load its own data).
- [x] Expected Delivery — inline view→edit→save (date input) inside `DeliveryCard`,
      gated by `order:update`.

## 7. Verify — DONE

- [x] `npx tsc --noEmit` (backend) — clean
- [x] `npx tsc --noEmit -p tsconfig.json` (frontend) — clean
- [x] `eslint` — 0 errors (6 warnings, same pre-existing pattern as before this pass —
      no new ones introduced)
- [x] `vite build` — clean
- [x] Live curl: order-number lookup (found + 404 + numeric route unaffected), full
      delivery sequence with history rows and correct location/note/updatedBy per
      entry, sequence-skip correctly rejected with a readable error, assigned-employee
      + expected-delivery updates on an already-DELIVERED order (correctly allowed),
      confirmed a genuine core edit (items) on that same order is still correctly
      dispatch-gated (proves the split between administrative and core edits works,
      not just that everything got more permissive)
- [ ] As with the previous UX pass: no browser automation available in this
      environment, so the actual click-through of the redesigned page (opening the
      Change Status dialog, the inline edit affordances, the timeline rendering) is a
      manual follow-up — everything below the UI interaction layer is verified.

## 8. Docs — DONE

- [x] `about.md` — new changelog section + status-summary line.
- [x] `phases.md` — noted under the Phase 6 Order Management section that delivery
      tracking history (a slice of Phase 7) was pulled forward by request, and what
      Phase 7 itself still owns.

---

**Implementation complete.** Backend (order-number lookup, delivery tracking history
with forward-only sequencing, assigned-employee/expected-delivery updates) is fully
built and live-verified via curl. Frontend (routing, full page redesign, delivery
section rebuild, inline-edit affordances) is fully typechecked, linted, and built
clean. Not done: an actual human click-through in a browser — no browser automation was
available. Recommend trying the redesigned Order Details page directly (open any order,
try Change Status through a full Dispatched→In Transit→Delivered sequence, try the
inline Assigned Employee / Expected Delivery edits) before considering this fully
signed off. This file can be deleted once reviewed, or kept as a record.
