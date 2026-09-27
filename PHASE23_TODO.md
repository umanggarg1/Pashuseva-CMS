# Phase 23 — Inline Delivery Status on Orders + Return-Path Stock Fix

**Status: implemented and verified locally 2026-09-27. Never run against production.**

- Verified on a throwaway Docker Postgres (`crm-phase23-test`, `localhost:55432`):
  - **Backend: 19/19**, including the double-restore bug reproduced on the pre-fix
    code (9 failures there).
  - **Phase 22 regression: 44/44.**
  - **Browser: 21/21** in one clean run.
- `tsc` and ESLint clean.
- **Not committed.**

Two related changes:

1. **Delivery Status editable directly in the Orders table** (desktop rows + mobile
   cards), built like Phase 22's Article No. editor: controlled and simple.
2. **Backend fix: stock can currently be restored twice** via the return path.
   The backend becomes the only authority for this; the frontend rules only shape
   what's offered.

## The request, as given

- Edit Delivery Status from the Orders table, similar to the Article No. editor, but
  "controlled and simple".
- Simple statuses: small confirmation box + optional location; **not** saved on
  click.
- Delivered / Returned / Lost / Damaged: open the **shared** Change Status dialog,
  keeping the payment, received-by and stock safeguards.
- Dropdown: only the **next allowed step** + Return / Lost / Damaged, per the
  existing role rules; the current status is not listed.
- Fix the double stock restore in this phase: the backend must refuse the return
  path for orders that were never dispatched, and the shared frontend rules must
  match.
- **The backend stays authoritative for every transition.** The shared frontend
  rules exist for the UI only; nothing may depend on them to block an invalid
  transition or a duplicate stock restore.
- No new backend endpoint: reuse `PATCH /orders/:id/delivery-status`.

## Current structure (inspected before planning)

| Piece | Where | Notes |
|---|---|---|
| Endpoint | `PATCH /orders/:id/delivery-status` | `delivery:update` + `checkOrderAccess`. Service `updateDeliveryStatus` → shared `applyDeliveryStatusChange` (Phase 22): status, tracking row, activity, order-status sync, payment on Delivered (needs `payment:create`), stock restore on Returned, `recalculateCustomerState`. |
| Backward-move rule | `assertNotBackwardDelivery` (order.service.ts) | Employees: forward only within a branch, never out of a final status. Admin/Manager: anything. Switching from the forward path to the return path is **always** allowed. |
| Status → order status sync | `DELIVERY_TO_ORDER_STATUS` | DISPATCHED→CONFIRMED, IN_TRANSIT→PROCESSING, OUT_FOR_DELIVERY→OUT_FOR_DELIVERY, DELIVERED→DELIVERED, RETURN_*→CANCELLED |
| Cancel | `orderService.cancel` | NOT_DISPATCHED → stock restored **immediately** (`'Order Cancelled'` rows). Dispatched/in transit → auto `RETURN_PENDING`; stock waits for RETURNED. |
| Return restore | `applyDeliveryStatusChange` | On RETURNED: stock restored for every item (`'Order Returned'` rows), **with no check whether it was already restored**. |
| Frontend rules | `OrderDetail.tsx` lines 54–92 | `DELIVERY_STEPS`, `DELIVERY_STATUS_OPTIONS`, `isDeliveryOptionAllowed`; Admin/Manager dialog lists every status unfiltered. |
| Dialog | `ChangeDeliveryStatusDialog` in `OrderDetail.tsx` | Owns its own trigger/open state. Needs `order.{id, deliveryStatus, paymentStatus, customer.name, address}`, `remaining`, `canOverrideStatus`, `canAddPayment`. |
| Orders list row | `Orders.tsx` | Has `id, orderNumber, deliveryStatus, orderStatus, paymentStatus, customer.name`. **No** address, **no** payment balance. |
| UI primitives | `components/ui` | `select`, `dialog`, `sheet`, … — no dropdown-menu/popover. |

### The double-restore bug (found by reading the code)

1. Cancel an order while **NOT_DISPATCHED** → stock restored (`'Order Cancelled'`).
2. Move it NOT_DISPATCHED → RETURN_PENDING. Switching to the return path is always
   allowed, both in the frontend rules and in the backend's `assertNotBackwardDelivery`.
3. → RETURN_IN_TRANSIT → **RETURNED** → stock restored **again**.

Also: an Admin/Manager moving RETURNED → back → RETURNED again restores a second
time too.

## Locked decisions

| # | Decision | Final |
|---|---|---|
| 1 | Simple statuses | Small confirmation box + **optional** location → existing PATCH. Never saved on click. |
| 2 | Delivered / Returned / Lost / Damaged | Open the **shared** Change Status dialog (preselected), keeping payment, received-by and stock handling |
| 3 | Dropdown content | Only the **next allowed step** + Return / Lost / Damaged, per the existing role rules. The current status is never listed. |
| 4 | Double stock restore | Fixed in this phase — backend guards (authoritative), frontend rules match |
| 5 | Authority | **The backend is authoritative for every transition.** Frontend rules are UI only. |
| 6 | Endpoint | No new endpoint — reuse `PATCH /orders/:id/delivery-status` |

Details that follow from these decisions (planning-level, adjustable):

| # | Detail | Choice |
|---|---|---|
| 7 | Backward moves / corrections | **Not in the table.** Admin/Manager corrections stay in Order Details' dialog; the table only ever offers forward/next moves. |
| 8 | Re-logging a location at the same status | Stays in Order Details (Add Location Update / dialog); not in the table. |
| 9 | Moving an order that isn't cancelled to Return Pending | Allowed (the customer refused delivery). The confirm text warns: "This also marks the order as Cancelled." |
| 10 | Loading the dialog from a row | Opening Delivered/Returned/Lost/Damaged loads the order (`/orders/number/:orderNumber`) for the address prefill and customer name, and `/orders/:id/payments` (only with `payment:view`) for the remaining balance. |
| 11 | After saving | Same as Phase 22: the page owns one mutation, writes `deliveryStatus` / `orderStatus` / `paymentStatus` from the response into the cached list, then background-refreshes and invalidates the order's detail, dashboard and reports. The row may drop out of a status filter; that's by design. |

## Next-step menu (shared frontend rule — UI only)

| Current delivery status | Offered in the table |
|---|---|
| NOT_DISPATCHED (not cancelled) | DISPATCHED |
| NOT_DISPATCHED + **CANCELLED** | nothing (no editor) |
| DISPATCHED | IN_TRANSIT · RETURN_PENDING · LOST · DAMAGED |
| IN_TRANSIT | OUT_FOR_DELIVERY · RETURN_PENDING · LOST · DAMAGED |
| OUT_FOR_DELIVERY | DELIVERED · RETURN_PENDING · LOST · DAMAGED |
| RETURN_PENDING | RETURN_IN_TRANSIT · LOST · DAMAGED |
| RETURN_IN_TRANSIT | RETURNED · LOST · DAMAGED |
| DELIVERED / RETURNED / LOST / DAMAGED (final) | nothing |
| forward in-transit status but order **CANCELLED** (only reachable via an Admin correction) | RETURN_PENDING · LOST · DAMAGED |

Simple (confirm box): DISPATCHED, IN_TRANSIT, OUT_FOR_DELIVERY, RETURN_PENDING,
RETURN_IN_TRANSIT. Shared dialog: DELIVERED, RETURNED, LOST, DAMAGED.

Every option in this table is a forward move, so each one is allowed for Employee,
Manager and Admin alike under the existing backend rule.

## Backend rules (authoritative)

```
updateDeliveryStatus(next):
  A. next ∈ {RETURN_PENDING, RETURN_IN_TRANSIT, RETURNED}
     AND current == NOT_DISPATCHED
     → 400 "This order was never dispatched — there is nothing to return."
     (applies to EVERY role, including Admin/Manager)

applyDeliveryStatusChange(RETURNED):
  B. restore stock ONLY IF no stock-restore row already exists for this order
     (StockHistory where orderId = id and reason ∈ {'Order Cancelled','Order Returned'}).
     If one exists: still set RETURNED + tracking + activity, but skip the restock and
     record activity "Stock already restored — not restored again".
```

Rule A closes the reported path; B makes "restore stock exactly once"
true no matter how the order reached RETURNED (including Admin corrections). The UI
can't break either rule.

## Proposed shape

### Backend

| File | Change |
|---|---|
| `services/order.service.ts` | Rule A in `updateDeliveryStatus` (before the transaction, all roles). Rule B in `applyDeliveryStatusChange`'s RETURNED branch. |
| `repositories/product.repository.ts` | `hasStockRestoreForOrder(orderId, tx)` — finds any `'Order Cancelled'`/`'Order Returned'` row for the order |
| (no route/schema/migration changes) | |

### Frontend

| File | Change |
|---|---|
| `lib/deliveryStatus.ts` (new) | Moved from OrderDetail: `DELIVERY_STEPS`, `DELIVERY_STATUS_OPTIONS`, return/final lists, `isDeliveryOptionAllowed` (now also: no return path from NOT_DISPATCHED, for every role), `STATUS_FIELD_CONFIG` labels, **new** `inlineNextStatuses(deliveryStatus, orderStatus)`, `isDialogStatus(s)`, `deliveryStatusLabel(s)` |
| `components/ChangeDeliveryStatusDialog.tsx` (new, moved) | The existing dialog, moved out of OrderDetail. Takes a minimal order shape and can be opened by the caller (`open`, `onOpenChange`, `initialStatus`), with the "Change Status" button optional. `onSuccess(result)` passes the saved order back. Admin/Manager list also filtered by the return-path rule. Behavior otherwise unchanged. |
| `components/DeliveryStatusEditor.tsx` (new) | UI state only. Badge + ▾ trigger (Select) listing `inlineNextStatuses`; simple → confirm Dialog ("Mark ORD-… as IN TRANSIT?", optional location, Confirm/Cancel, saving state, inline error); dialog statuses → `onOpenDialog(status)`. Clicks don't bubble (mobile card `<Link>`). Plain badge when `canEdit` is false or there are no options. |
| `pages/Orders.tsx` | `canEditDelivery = hasPermission('delivery:update')`. Page-level mutation for simple saves (cache write + refresh + invalidation + toast). One shared dialog instance for the heavy statuses, which loads the order and payments when opened. Desktop Delivery cell + mobile card badge use the editor. |
| `pages/OrderDetail.tsx` | Uses the shared dialog + shared rules (no behavior change on the Details page). |

## Deliberately excluded

- Backward moves / corrections from the table (decision 7).
- Rejecting forward moves on an **already-cancelled** order in the backend (e.g. an
  Admin moving a cancelled order to DELIVERED would un-cancel it via the sync).
  This is an existing behavior, not the reported bug; noted for a later phase.
  The table never offers it.
- Concurrent double-submit hardening (same read-then-write pattern as Phase 22's
  known limitation).

## TODO checklist

**Backend**

- [x] Rule A: refuse the return path from NOT_DISPATCHED (all roles), clear 400 message
- [x] Rule B: RETURNED restores stock only if not already restored; activity note when skipped
- [x] `productRepository.hasStockRestoreForOrder`
- [x] `tsc` / lint clean

**Frontend**

- [x] `lib/deliveryStatus.ts` — shared rules + `inlineNextStatuses`
- [x] `components/ChangeDeliveryStatusDialog.tsx` — moved, controllable, minimal order shape
- [x] `components/DeliveryStatusEditor.tsx` — next-step menu, confirm box, no bubbling
- [x] `Orders.tsx` — desktop + mobile, simple-save mutation, dialog loads its data when opened, cache write + refresh
- [x] `OrderDetail.tsx` — uses shared dialog/rules; unchanged behavior
- [x] `tsc` / lint clean

Implementation notes:
- `ChangeDeliveryStatusDialog` moved out of OrderDetail as-is; only changes: it can
  be opened by the caller (fresh mount per opening — no reset effect), and the
  Admin/Manager status list now drops the return path for NOT_DISPATCHED (Rule A).
- `OrderDetail.tsx` only lost the moved code and gained 2 imports.
- The table's dialog loader fetches the order + payments with
  `refetchOnMount: 'always'`. **Bug found by the browser run and fixed:** with the
  app-wide 30 s `staleTime`, reopening the dialog for the same order (e.g. Lost →
  Cancel → Damaged) never fetched again and stayed stuck on "Loading…".
- One cache-merge helper (`applySavedRow`) is now shared by the Article No. and
  delivery-status saves on the Orders page.

**Verification (local Docker DB only — never production)**

Backend (automated):
- [x] NOT_DISPATCHED → RETURN_PENDING / RETURN_IN_TRANSIT / RETURNED → 400 for Employee **and** Admin; nothing written
- [x] Cancelled-before-dispatch order: stock restored once at cancel; any later route to RETURNED (Admin: → DISPATCHED → … → RETURNED) does **not** restore again; activity notes the skip
- [x] Dispatched → cancel → return path → RETURNED restores stock exactly once
- [x] Admin RETURNED → IN_TRANSIT → … → RETURNED again: no second restore
- [x] Every table transition via the API: DISPATCHED/IN_TRANSIT/OUT_FOR_DELIVERY/RETURN_PENDING/RETURN_IN_TRANSIT with and without location; order-status sync correct
- [x] Regression: Phase 22 suite still 44/44
- [x] Employee backward move (IN_TRANSIT → DISPATCHED) still 400 — existing rule unchanged
- [x] **Bug reproduced on the pre-fix backend** (the two backend files stashed, same
      suite, fresh DB): 9 failures. The never-dispatched return path returned 200,
      and stock was inflated, **104 instead of 102** after cancel-before-dispatch →
      … → RETURNED, and **107 instead of 104** after an Admin RETURNED → back →
      RETURNED. With the fix: 19/19.

Results: backend **19/19** (run twice on fresh DBs); Phase 22 regression **44/44**.

Browser (Playwright):
- [x] Menu shows exactly the next-step table above for each status; current status not listed; no editor for final statuses / cancelled NOT_DISPATCHED / users without `delivery:update`
- [x] Simple status: confirm box, optional location, Cancel = no request, Confirm = one PATCH; row updates instantly; page/filters/sort preserved
- [x] RETURN_PENDING confirm warns about Cancelled
- [x] Delivered from the table opens the shared dialog preselected, with the address prefill and the payment section; saving records the payment once
- [x] Returned / Lost / Damaged open the shared dialog
- [x] Mobile card: menu + confirm don't navigate
- [x] Order Details Change Status still works as before (and hides the return path for NOT_DISPATCHED)
- [x] Server error → message inside the confirm box, box stays open, row unchanged
- [x] Reopening the dialog for the same order (Lost → Cancel → Damaged) works — regression for the staleTime bug above

Results: browser **21/21** in one clean run (fresh DB `crm_phase23_ui`, logged in
through the real login page as Admin, an Employee with `delivery:update`, and an
Employee without it). Screenshots checked by eye: desktop ▾ triggers, the
next-step menu, the Delivered dialog with the address prefill + payment section,
and the mobile confirm box.

## Production release + verification (2026-09-27)

Pushed `c8b832a` + `299deb1` to `origin/main` at 15:40. No schema change, so no
migration.

**Deployment confirmed:**

- **Vercel:** live bundle `index-BSSYkZ3s.js` contains the Phase 23 editor text
  ("Starting a return also marks the order as Cancelled.") at 15:41.
- **Render:** check P1 below. The first request was the new backend rule itself;
  the old backend would have accepted it.

**Production test on dedicated test orders only**, run by the same script as a
local dry run first (14/14 there).

- **Account:** `test@gmail.com` (EMPLOYEE with `delivery:update`, `payment:create/view`;
  no `order:cancel` / `order:delete`).
- **Test customer:** **#152 "TEST Phase23 — delete me"** (phone 9000022023).
- **5 orders** of 1 × FEED SAMPLE 500G (#36): **ORD-2026-000167 (#169) … ORD-2026-000171 (#173)**.
- **Browser saves** were allowed only for these 5 order ids.
- **Stock recorded before any change: 99.**

| # | Check | Result |
|---|---|---|
| P1 | Never-dispatched order → RETURN_PENDING refused (400 "never dispatched"), order unchanged — also proves Render runs 299deb1 | ✅ |
| P2 | Menu for NOT_DISPATCHED = DISPATCHED only | ✅ |
| P3 | Simple status: confirm box ("Dispatch Location (optional)"); Cancel = no request; Confirm = one PATCH; row DISPATCHED + CONFIRMED; location saved | ✅ |
| P4 | IN TRANSIT with an empty location (Enter) → saved without location, PROCESSING | ✅ |
| P5 | OUT FOR DELIVERY menu = DELIVERED… · RETURN PENDING · LOST… · DAMAGED… | ✅ |
| P6 | DELIVERED… → shared dialog preselected, Delivered At prefilled, Received By + Payment Details; **Cancelled** (no delivery or payment recorded on production — the save path is covered locally, U4) | ✅ |
| P7 | RETURN PENDING: warning shown; row → CANCELLED + RETURN PENDING | ✅ |
| P8 | RETURNED… → shared dialog (preselected, Received By) → saved; **stock +1 exactly** | ✅ |
| P9 | RETURNED logged again → 200, **stock not restored twice**, activity "Stock already restored — not restored again" | ✅ |
| P10 | LOST… / DAMAGED… open the shared dialog preselected; Cancel sends nothing; reopening works | ✅ |
| P11 | Mobile: menu + confirm never open the order | ✅ |
| P12 | Phase 22 regression: first Article No. → DISPATCHED + CONFIRMED @ Kanina Post Office | ✅ |
| G | No browser write outside the test orders | ✅ |
| CLEAN | Every test order walked back to RETURNED; **stock 99 → 94 (5 orders) → 99** — each restored exactly once | ✅ |
| — | Employee **without** `delivery:update` on production | **NOT RUN** (no such production test account; covered locally, U8) |
| — | Concurrent-submission race | Not attempted on production, by design |

No real customer orders were read or modified. All 5 test orders end at
RETURNED / CANCELLED.

**Admin cleanup: done (2026-09-27).** An Admin moved ORD-2026-000167 …
ORD-2026-000171 and customer #152 "TEST Phase23 — delete me" to Trash; no
permissions were changed. Verified read-only from `test@gmail.com`, where a trashed
record returns 404 but an existing, unassigned one returns 403: `/orders/169`–`/173`
→ 404 "Order not found"; `/customers/152` → 404 "Customer not found"; FEED SAMPLE
500G stock still 99.
