# Phase 24 — Delivery Status menu: all valid next steps + Cancel order

**Status: implemented and verified locally 2026-09-27. Never run against production.**

- Verified on a throwaway Docker Postgres (`crm-phase24-test`, `localhost:55432`):
  - **Backend: 23/23** new checks.
  - **Regression:** Phase 22 **44/44** and Phase 23 **19/19** unchanged.
  - **Browser: 28/28** in one clean run.
- `tsc` and ESLint clean.
- **Not committed.**

Changes Phase 23's table menu from "only the next step" to **every valid forward
status from the current one** (e.g. In Transit → Delivered directly), adds
**Cancel order…** for Not Dispatched orders, and makes the backend enforce that a
Not Dispatched order can only move to Dispatched.

## The request, as given

- Not Dispatched → only **Dispatched** or **Cancelled**. Nothing else.
- Once dispatched, show **all** valid future steps, not just the immediate next one,
  plus the return/final options. The current status is shown as display-only (✓).
- Final states (Delivered, Returned, Lost, Damaged): no menu.
- Backward moves stay out of the table (Admin/Manager use Order Details).
- Keep the endpoint and transaction logic, unless the backend allows transitions the
  new rule prohibits (it did — see decision 2).

## Locked decisions

| # | Decision | Final |
|---|---|---|
| 1 | "Cancelled" in the table | It's an **order** action, not a delivery status: **Cancel order…**, shown only to users with **`order:cancel`**, opens a box with a **required reason**, calls the existing `POST /orders/:id/cancel` (stock back immediately for Not Dispatched). |
| 2 | Backend rule | **Not Dispatched → only Dispatched**, for **every role** (Admin/Manager included, also in Order Details). Everything else → 400. Re-selecting Not Dispatched itself stays allowed (no-op re-log). Phase 23's return-path guard stays in front with its own message. |
| 3 | Return options from forward stages | **Exactly as listed:** Dispatched / In Transit / Out for Delivery offer Return Pending and Returned…, **not** Return In Transit (that appears only after Return Pending). |
| 4 | Current status | Shown first in the menu as a disabled "✓ STATUS" item (replaces Phase 23's "current status not listed"). |
| 5 | Cancelled orders | Unchanged from Phase 23. Cancelled + Not Dispatched → no menu. Cancelled + forward status (only via an Admin correction) → return / Lost / Damaged only, never Delivered, which would silently un-cancel it. |
| 6 | Going straight to Returned from a forward stage | Allowed (backend already allows it). Goes through the shared dialog, marks the order Cancelled through the existing sync, and restores stock exactly once (Phase 23 rule B). The dialog now warns "This also marks the order as Cancelled" for return statuses on a non-cancelled order. |
| 7 | Endpoint | Unchanged: `PATCH /orders/:id/delivery-status` and the existing `POST /orders/:id/cancel`. No schema change. |
| 8 | **Order Details uses the same rules** (added mid-phase by the user) | One shared function, **`getAllowedDeliveryStatusOptions(current, orderStatus)`**, feeds both the table menu and Order Details' Change Status dialog, so both screens always offer identical forward choices. |
| 9 | Backward corrections in Order Details | Admin/Manager only, via **`getCorrectionOptions`**, shown as a **separate labelled group "Correction (move back)"** in the dialog with a warning when picked — never mixed with forward options and never in the table. None out of Not Dispatched; never back to Not Dispatched for a cancelled order (it could then neither be returned nor cancelled, so its stock would never come back). |
| 10 | Re-logging a location at the current status | The dialog no longer lists the current status, so **Add Location Update** now shows for every in-progress status (Dispatched, In Transit, Out for Delivery, Return Pending, Return In Transit), not just the two transit ones. |
| 11 | Cancel in Order Details' dialog | Not Dispatched + `order:cancel` → **Cancel order…** in the dialog too (reason required; location/note fields hidden). The existing separate Cancel Order button stays. |
| 12 | No options | The dialog's "Change Status" button is hidden when the user has nothing to choose (e.g. an Employee on a final status, a cancelled Not Dispatched order). |

## Menu (UI; the backend decides)

| Current | Offered in the table (after the disabled ✓ current item) |
|---|---|
| Not Dispatched | Dispatched · *Cancel order…* (only with `order:cancel`) |
| Not Dispatched + Cancelled | no menu |
| Dispatched | In Transit · Out for Delivery · Delivered… · Return Pending · Lost… · Damaged… · Returned… |
| In Transit | Out for Delivery · Delivered… · Return Pending · Lost… · Damaged… · Returned… |
| Out for Delivery | Delivered… · Return Pending · Lost… · Damaged… · Returned… |
| forward stage + Cancelled | Return Pending · Lost… · Damaged… · Returned… |
| Return Pending | Return In Transit · Lost… · Damaged… · Returned… |
| Return In Transit | Returned… · Lost… · Damaged… |
| Delivered / Returned / Lost / Damaged | no menu |

"…" = shared Change Status dialog; the rest = confirm box with optional location
(Phase 23).

## Known, not changed here

- Order Details' existing **Cancel Order** button shows for `order:update`, but
  `POST /:id/cancel` checks `order:cancel` — the same "shown, then 403" kind of
  mismatch Phase 22 fixed for Expected Delivery. Left for a later phase.

## Proposed shape

| File | Change |
|---|---|
| `backend/src/services/order.service.ts` | Rule C in `updateDeliveryStatus`: current NOT_DISPATCHED and next ∉ {NOT_DISPATCHED, DISPATCHED} → 400 (after the Phase 23 return guard) |
| `frontend/src/lib/deliveryStatus.ts` | `inlineNextStatuses` → all forward steps per the table; `isDeliveryOptionAllowed` → Not Dispatched offers only itself + Dispatched for every role |
| `frontend/src/components/DeliveryStatusEditor.tsx` | Disabled "✓ current" item; **Cancel order…** item (when allowed) → box with required reason → `onCancelOrder(reason)` |
| `frontend/src/components/ChangeDeliveryStatusDialog.tsx` | Warning for a return status on a non-cancelled order (optional `orderStatus` on the dialog's order shape) |
| `frontend/src/pages/Orders.tsx` | `canCancel = hasPermission('order:cancel')`; cancel mutation → cache merge + refresh + toast |

## TODO checklist

**Backend**
- [x] Rule C (all roles), clear 400 message
- [x] `tsc` / lint

**Frontend**
- [x] `inlineNextStatuses` / `isDeliveryOptionAllowed` per the table
- [x] Editor: ✓ current item, Cancel order… with required reason
- [x] Dialog: return-status warning
- [x] Orders: cancel mutation, `order:cancel` gating
- [x] `tsc` / lint

**Verification (local Docker DB only)**
- [x] Rule C: Not Dispatched → In Transit / Out for Delivery / Delivered / Lost / Damaged → 400 for Employee **and** Admin; → Dispatched OK; nothing written on 400
- [x] Skips allowed from dispatched stages (Dispatched → Delivered, In Transit → Returned, …) with correct order-status sync and stock
- [x] Phase 23 backend suite + Phase 22 suite still pass (expectations updated only where Phase 24 intentionally changed them)
- [x] Browser: menu per status exactly as the table (incl. ✓ current, disabled); Cancel order… only with `order:cancel`; reason required; cancel restores stock and the row shows CANCELLED with no menu; skip to Delivered/Returned via the dialog; Returned warning in the dialog; Order Details dialog offers only Not Dispatched/Dispatched for a Not Dispatched order (Admin too); mobile doesn't navigate

**Added mid-phase (Order Details uses the same rules)**
- [x] `getAllowedDeliveryStatusOptions` (renamed from `inlineNextStatuses`) feeds both the table and the dialog
- [x] `getCorrectionOptions` + "Correction (move back)" group + warning (Admin/Manager, dialog only)
- [x] Dialog: no preselection; Cancel order… with required reason; Change Status hidden when there are no options
- [x] Add Location Update for every in-progress status
- [x] `SelectGroup` / `SelectLabel` / `SelectSeparator` added to `components/ui/select.tsx`

### Results

- **Backend 23/23** (run twice, on `crm_phase24` and `crm_phase24_ui`):
  - Rule C (5 skips × Employee and Admin → 400, nothing written).
  - Return-path guard unchanged.
  - Re-log Not Dispatched allowed; → Dispatched OK.
  - Skips: Dispatched → Delivered, In Transit → Returned (stock +2 once, no second restore), Dispatched → Out for Delivery → Lost, Return Pending → Returned.
  - Cancel: 403 without `order:cancel`, 400 on an empty reason, and it restores stock immediately.
- **Regression:** Phase 22 **44/44**, Phase 23 **19/19**, with no changes to their expectations.
- **Browser 28/28** in one clean run (Admin, Employee with `order:cancel`, Employee without it, Employee without `delivery:update`; desktop + mobile):
  - **Menus:** table menu per status exactly as the table above, with ✓ current disabled; **Order Details dialog shows the identical choices for every status** (M1/M2 × 6 statuses); no menu and no Change Status on final statuses or a cancelled Not Dispatched order.
  - **Cancel order…:** only with `order:cancel` (table + dialog); reason required in both; restores stock immediately.
  - **Admin corrections:** in their own group with a warning; saving one works; none in the table.
  - **Skipping ahead:** skips via the confirm box and via the dialog; the Returned warning shows.
  - **Add Location Update** on the new statuses.
  - **Mobile:** doesn't navigate.

**Bug found by the browser run and fixed:** the first correction rule listed
**Return In Transit as a "correction" for a Dispatched order**. That's a forward move
the menu deliberately omits (decision 3), not a move back. `getCorrectionOptions`
now excludes return-path statuses while the order is still on the forward path.
Test-only fixes: two checks read the page before React re-rendered (they now wait
for the element), and one toast check matched the page's "Order cancelled: …"
banner too (now scoped to the toast).

## Production release + verification (2026-09-27)

Pushed `f53141c` + `f6d905c` to `origin/main` at 16:28. No schema change, so no
migration.

**Deployment confirmed:**

- **Vercel:** live bundle `index-ESog9Mnh.js` contains "Correction (move back)" at
  16:28:59.
- **Render:** check P1 below. The first request was Rule C itself; the old
  backend would have accepted the skips.

**Production test on dedicated test orders only.** The same script passed 19/19
as a local dry run first, as an Employee with `delivery:update` and no
`order:cancel`.

- **Account:** `test@gmail.com` (EMPLOYEE).
- **Test customer:** **#153 "TEST Phase24 — delete me"** (phone 9000022024).
- **4 orders** of 1 × FEED SAMPLE 500G (#36): **ORD-2026-000172 (#174) … ORD-2026-000175 (#177)**.
- **Browser saves** were allowed only for these order ids.
- **Stock recorded before any change: 99.**

| # | Check | Result |
|---|---|---|
| P1 | Not Dispatched → In Transit / Delivered / Lost all refused (400 "cannot skip ahead"), order unchanged — proves Render runs f6d905c | ✅ |
| P2 | Not Dispatched menu, table + Order Details | ✅ with a note: the menus showed **Dispatched · Cancel order…**. `/auth/me` shows **`test@gmail.com` now has `order:cancel`** (plus `order:delete`, `customer:delete`) — granted after Phase 23 — so this is the correct behavior for this account. The script expected the old permissions. |
| P3–P5 | Dispatched / In Transit / Out for Delivery: **all forward choices** in the table, **identical** list in Order Details, no corrections group for an Employee | ✅ (6 checks) |
| P6 | Dispatched → Out for Delivery directly from the table (skips In Transit) | ✅ |
| P7 | In Transit → Returned… directly: dialog warns "This also marks the order as Cancelled"; order RETURNED + CANCELLED; stock +1 exactly | ✅ |
| P8 | Final status (Returned): no table menu, no Change Status in Order Details | ✅ |
| P9 | Return Pending from the table (confirm-box warning); return-path menu identical in both places | ✅ (3 checks) |
| P10 | Add Location Update hidden on Not Dispatched, shown on Out for Delivery (new); logs a checkpoint without changing status | ✅ |
| P11 | Delivered… opens the shared dialog preselected; **Cancelled** — nothing saved | ✅ |
| G | No browser write outside the test orders | ✅ |
| CLEAN | Every test order walked back to RETURNED; **stock 99 → 99** | ✅ |
| — | Cancel order… **hidden** without `order:cancel` | **NOT RUN** on production — no such production account any more; covered locally (M3) |
| — | Cancel order… positive path (actually cancelling) | Not run on production (as agreed; covered locally X1/X2/Mob) — the option was only seen, never clicked |
| — | Admin/Manager "Correction (move back)" group | **NOT RUN** on production (no Admin login); covered locally (A1–A4). On production the Employee saw no corrections group. |

No real customer orders were read or modified.

**Heads-up:** `test@gmail.com` now holds `order:cancel`, `order:delete` and
`customer:delete`. Revoke them if they were granted only for testing.

**Admin cleanup pending:** move ORD-2026-000172 … ORD-2026-000175 and customer
#153 "TEST Phase24 — delete me" to Trash. (Now that its orders are finished,
Phase 19 unassigns the test account, so it can no longer reach them itself.)

**Not changed here (separate follow-up):** Order Details' Cancel Order button is
shown for `order:update`, but the backend requires `order:cancel`.
