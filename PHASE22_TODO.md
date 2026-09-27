# Phase 22 — Inline Article No. on Orders + Auto-Dispatch + Optional Location

**Status: implemented 2026-09-27 (backend + frontend, one pass). Backend and
frontend `tsc` and ESLint clean. Implemented, **not yet verified**. Backend `.env`
points at the live Neon DB, so verification runs against a throwaway local Docker
Postgres (`crm-phase22-test`, `localhost:55432`), never production. That run is in
progress. This document is committed on its own first; the code is not committed
yet and waits for verification.**

Three related changes:

1. Add/edit the India Post Article No. **directly from the Orders table** (desktop
   rows and mobile cards) without opening Order Details.
2. Saving a **new** Article No. on an order that hasn't been dispatched yet
   automatically marks it **Dispatched** with location **Kanina Post Office** —
   atomically, in one backend transaction.
3. In Order Details' **Change Delivery Status** dialog, **location becomes optional**
   for every status.

## The request, as given

Orders table, inline:

```
Order ID | Customer | Status  | Article No.        | ...
---------|----------|---------|--------------------|----
#PS1023  | Rahul    | Shipped | AB123456789IN ✏️    |
#PS1024  | Amit     | Packed  | [+ Add Article No.]|
```

- No Article No. → show **Add Article No.**; click → input appears.
- Has one → show it; editing via a pencil (clicking the number itself keeps the
  existing copy + open India Post behavior).
- **Enter** / ✓ saves, **Esc** cancels. Small success/error indication.
- Save through a backend API; no navigation to Order Details.
- Pagination, search, filters, sort preserved after saving.
- Entering an Article No. automatically sets delivery status to Dispatched with
  location "Kanina Post Office" — article no., status and location updated
  **together** (all or nothing), and **only when the Article No. is newly
  entered**, not on every edit.
- "In change delivery status, make location optional."

## Current structure (inspected before planning)

### Data

| Concept | Stored in | Notes |
|---|---|---|
| Article No. | `Order.articleNumber` (`String?`) | `schema.prisma` — renamed from the old unused `trackingNumber` |
| Delivery status | `Order.deliveryStatus` (enum) | Value is `DISPATCHED` — there is no `DISPATCH` |
| Location | `DeliveryTracking.location` (`String?`), one history row per status change | **No location column on Order → no DB migration needed** |
| Order status | `Order.orderStatus` | Auto-synced from delivery status via `DELIVERY_TO_ORDER_STATUS` (`DISPATCHED → CONFIRMED`) |

### APIs

| Action | Endpoint | Permission | Service |
|---|---|---|---|
| Save Article No. | `PATCH /orders/:id` `{ articleNumber }` | `order:update` | `orderService.update` — logs "Article number changed" |
| Change delivery status + location | `PATCH /orders/:id/delivery-status` | `delivery:update` | `orderService.updateDeliveryStatus` — one transaction: status, tracking row, activity, order-status sync, payment-on-delivery, stock-on-return, `recalculateCustomerState` |

- `articleNumberSchema` (`order.schema.ts`) only trims and maps `''` → `null`; no
  format check.
- Location is **already optional in the backend**
  (`updateDeliveryStatusSchema.location: z.string().min(1).optional()`).

### Frontend

- **Orders table** (`Orders.tsx`): columns Order, Customer, Phone, Amount,
  Payment, Article Number (read-only; click = `openArticleNumberTracking`), Order
  Status, Delivery. Mobile = cards, each one a `<Link>`. Page/search/filters/sort
  live in the URL and the `['orders', {...}]` query key. Search is already
  debounced 300 ms (`useDebouncedValue`).
- **Order Details** (`OrderDetail.tsx`) `DeliveryCard`: Article No. pencil → input →
  Save/Cancel, saved via `PATCH /orders/:id`. Shown when the user has
  `delivery:update`, but the backend checks `order:update` — **a pre-existing
  frontend/backend permission mismatch**, fixed by this phase.
- **Change Delivery Status dialog**: `STATUS_FIELD_CONFIG` marks location
  **required** for `DISPATCHED`, `IN_TRANSIT`, `RETURN_IN_TRANSIT`; the Update
  button is disabled until it's filled.

## Locked decisions

| # | Decision | Final |
|---|---|---|
| 1 | Permission for the new endpoint | `delivery:update` (it can change delivery status; matches who already sees the edit control on Details) |
| 2 | Order status during auto-dispatch | Use the **existing** `DISPATCHED → CONFIRMED` sync unchanged (so a Processing order also becomes Confirmed, same as a manual dispatch today) |
| 3 | Article No. format | Trim + uppercase + **validate** India Post format `AB123456789IN` (2 letters, 9 digits, `IN`) — `/^[A-Z]{2}\d{9}IN$/`. Empty = clear. |
| 4 | Existing Article No. changed to another | Number only — no dispatch, no new tracking row |
| 5 | Existing Article No. cleared | Number only — **no** status rollback |
| 6 | Cache strategy after save | Page owns one shared save action; on success, write the returned order into the cached Orders list immediately, then background-refresh. No optimistic update / rollback. |
| 7 | Invalidation | Keep `['orders']`, that order's detail/activity/tracking, `['dashboard']`, `['reports']` — `invalidateQueries` only refetches **mounted** queries, so dashboard/reports cost nothing until opened; the dashboard really does count by delivery status, so it must not go stale. |
| 8 | Cheap path | The number-only path (change/clear/no-op) must **not** load items/payments/stock/customer — a lean lookup + one update + one activity row. The heavy order load and the shared delivery logic run only on the auto-dispatch path. |
| 9 | Add Location Update dialog | Unchanged — location stays required there (adding a location is its only purpose) |
| 10 | Older non-conforming Article Nos. | Left as they are; they're only re-validated when someone edits them. `PATCH /orders/:id` and Create Order keep their existing schema. |
| 11 | Same number + Save | **No-op.** Frontend normalizes (trim + uppercase) and, if equal to the saved value, just closes the editor without sending a request. Backend also compares first and returns unchanged — no tracking row, no status/order-status change, no activity entry, no auto-dispatch. |
| 12 | Order of checks in the backend | Normalize → **compare with the saved value (no-op if equal)** → only then validate the `AB123456789IN` format. So re-saving an old non-conforming number unchanged never fails with a format error. The format check therefore lives in the service, after the no-op check, not in the Zod schema. |
| 13 | Expected Delivery / Delivery Charges ✏️ | Shown only with **`order:update`** (what the backend's `PATCH /orders/:id` actually checks). Backend permission unchanged — `delivery:update` stays delivery-only. Fixes the pre-existing "shown, then 403" mismatch. |
| 14 | Employee defaults | **Unchanged** — Employees don't get `delivery:update` by default; Admin/Manager grants it per Employee (Delivery → Update Delivery Status). |
| 15 | Execution | Whole phase implemented in one pass (pieces are tightly coupled). |

## Business rule

```
new = trim(input).toUpperCase(); '' → null (clear)
IF new == trim(old).toUpperCase() → no-op (nothing written), checked BEFORE format
ELSE IF new != null and !/^[A-Z]{2}\d{9}IN$/.test(new) → 400

IF   old articleNumber is empty
AND  new is not empty
AND  deliveryStatus == NOT_DISPATCHED
AND  orderStatus    != CANCELLED
THEN  ONE transaction:
      ├─ Order.articleNumber  = new                       + activity "Article number changed"
      ├─ Order.deliveryStatus = DISPATCHED                + activity "Delivery status changed"
      ├─ DeliveryTracking row: DISPATCHED, location "Kanina Post Office",
      │                        note "Auto-dispatched on article number entry", updatedBy = user
      ├─ Order.orderStatus    = CONFIRMED (existing sync) + activity "Order status auto-updated (delivery sync)"
      └─ recalculateCustomerState (existing, same as any delivery change)
ELSE  articleNumber only (+ "Article number changed"), or nothing at all if unchanged
```

| Situation | Result |
|---|---|
| Empty → filled, Not Dispatched | Save + **auto-dispatch** (Kanina Post Office) |
| Empty → filled, already Dispatched or later | Number only |
| Filled → different number | Number only |
| Filled → cleared | Number only, status unchanged |
| Same value saved again (incl. different case/spaces) | No-op: no request from the UI; backend also no-ops. No activity row, no tracking, no status change. |
| Old non-conforming number saved unchanged | No-op (compared before format validation) — no error |
| Order Cancelled | Number only — never auto-dispatch (the sync would overwrite Cancelled with Confirmed) |
| Invalid format | Caught in the editor before any request (same regex); if it reaches the API anyway → 400 with a clear message. The editor stays open with the typed value either way. |
| Trashed / missing order | 404 · no access → 403 (existing `checkOrderAccess`) |

## Proposed shape

### Backend

| File | Change |
|---|---|
| `backend/src/constants/delivery.ts` (new) | `DEFAULT_DISPATCH_LOCATION = 'Kanina Post Office'`, `INDIA_POST_ARTICLE_NUMBER_REGEX` |
| `backend/src/schemas/order.schema.ts` | `updateArticleNumberSchema` — `articleNumber: z.string()` transformed to trim + uppercase, `'' → null`. **No format refine here**; the format check lives in the service after the no-op compare (decision #12). |
| `backend/src/routes/api/orders.ts` | `PATCH /:id/article-number` — `authorize('delivery:update')`, `checkOrderAccess` |
| `backend/src/controllers/order.controller.ts` | `updateArticleNumber` → `res.json({ order, autoDispatched })` |
| `backend/src/repositories/order.repository.ts` | `findArticleState(id)` (lean select: `id, articleNumber, deliveryStatus, orderStatus`, not trashed) and `setArticleNumber(id, value, tx)` (plain update, no items/address include) |
| `backend/src/services/order.service.ts` | Extract the body of `updateDeliveryStatus`'s transaction into a shared `applyDeliveryStatusChange(existing, data, actingUser, tx)` — **behavior unchanged**. Add `updateArticleNumber(id, value, actingUser)` per the rule above; the heavy `findById` + `applyDeliveryStatusChange` run only when auto-dispatching. |

API contract:

```
PATCH /api/orders/:id/article-number
{ "articleNumber": "ab123456789in" }

200 { "order": { id, articleNumber: "AB123456789IN", deliveryStatus, orderStatus, ... },
      "autoDispatched": true }
(no-op: 200 with the unchanged order and "autoDispatched": false)
400 invalid format / missing field · 403 no permission/access · 404 not found or trashed
```

### Frontend

| File | Change |
|---|---|
| `frontend/src/lib/articleNumber.ts` (new) | Same regex + `normalizeArticleNumber()` for instant client-side validation |
| `frontend/src/components/ArticleNumberEditor.tsx` (new) | **UI state only**: display/editing, input value, saving, error. Props: `articleNumber`, `canEdit`, `onSave(value) => Promise`. Empty → `+ Add Article No.`; filled → number (click = copy + India Post, as today) + ✏️. Enter/✓ save, Esc/✕ cancel, autofocus; clicking outside does **not** save. Clicks/keys don't bubble (so the mobile card `<Link>` doesn't navigate). No query/mutation of its own. |
| `frontend/src/pages/Orders.tsx` | One page-level `useMutation` → `PATCH /orders/:id/article-number`. On success: `setQueriesData(['orders'])` merges `articleNumber/deliveryStatus/orderStatus` into the row → then invalidate `['orders']` (background refetch), `['order', orderNumber]`, `['order', id]` (prefix — covers activity/tracking/notes/payments), `['dashboard']`, `['reports']`. Toast: "Article No. saved — marked Dispatched (Kanina Post Office)" or "Article No. saved". Desktop cell + mobile card line use the editor; `canEdit = hasPermission(user, 'delivery:update')`. Mobile line shows when the order has a number **or** the user can edit. |
| `frontend/src/pages/OrderDetail.tsx` | `DeliveryCard`'s inline Article No. edit replaced by `ArticleNumberEditor`, backed by a new page mutation to the new endpoint (so Details auto-dispatches too). `articleNumber` removed from `updateOrderFields`. `STATUS_FIELD_CONFIG` drops `locationRequired`; no `*`; Update button disabled only while pending. Add Location Update dialog unchanged. Expected Delivery / Estimated Delivery Charges ✏️ gated on `order:update` via a new `canEditOrderFields` prop (decision #13). |

### Expected side effects (by design)

- Under a "Not Dispatched" filter, an auto-dispatched order leaves the list after
  the background refresh.
- A Processing order that gets auto-dispatched becomes Confirmed (existing sync
  rule, decision #2).

## Deliberately excluded (separate tasks, not blocking this phase)

Checked against the code during planning:

- **Already done:** search debounce (300 ms); tracking/activity never loaded by the
  Orders list; DB indexes on `orderStatus/deliveryStatus/paymentStatus/orderDate`.
- **Deferred:**
  - Check whether Render compresses responses (the Express app doesn't).
  - Log request timings.
  - Load each page only when it's opened (nothing is lazy-loaded today).
  - Trim unused fields (`assignedEmployees`, unused scalars) from the Orders list response.
- **Not needed now:** cursor pagination, count optimization, Redis/caching,
  trigram search indexes.

## TODO checklist

**Backend**

- [x] `constants/delivery.ts` — `DEFAULT_DISPATCH_LOCATION`, article-number regex
- [x] `updateArticleNumberSchema` in `order.schema.ts` (trim, uppercase, `'' → null`; format check deliberately **not** here — see decision #12)
- [x] Service: no-op compare **before** format validation (decision #12)
- [x] `orderRepository.findArticleState` + `setArticleNumber`
- [x] Refactor: extract `applyDeliveryStatusChange(existing, data, actingUser, tx)` from `updateDeliveryStatus` — no behavior change
- [x] `orderService.updateArticleNumber` — no-op / number-only (cheap) / auto-dispatch (one transaction)
- [x] `orderController.updateArticleNumber` + route `PATCH /:id/article-number` (`delivery:update`, `checkOrderAccess`)
- [x] `tsc` / lint clean

Implementation notes:
- The number-only path does exactly one lean `findFirst` (`id, articleNumber,
  deliveryStatus, orderStatus`) + one `update` + one activity row. The full
  `findById` is only loaded on the auto-dispatch path.
- The no-op compare normalizes the stored value too (trim + uppercase), so an old
  lowercase number saved unchanged is also a no-op.
- `updateDeliveryStatus` now just runs its pre-checks and then
  `prisma.$transaction(tx => applyDeliveryStatusChange(...))`. The body moved
  verbatim; behavior is unchanged.

**Frontend**

- [x] `lib/articleNumber.ts` — regex + normalize
- [x] `components/ArticleNumberEditor.tsx` — UI-only states, Enter/Esc, no event bubbling
- [x] `Orders.tsx` — shared mutation, cache write from response + background refresh, targeted invalidation, desktop cell + mobile card
- [x] `OrderDetail.tsx` — Delivery card uses the editor + new endpoint; drop `articleNumber` from `updateOrderFields`
- [x] `OrderDetail.tsx` — `STATUS_FIELD_CONFIG` location optional everywhere; button no longer blocked on location
- [x] `OrderDetail.tsx` — Expected Delivery / Estimated Delivery Charges ✏️ gated on `order:update` (new `canEditOrderFields` prop), decision #13
- [x] `tsc` / lint clean

Implementation notes:
- Orders list: `setQueriesData(['orders'])` skips cache entries without a `data`
  array. `DownloadOrdersDialog`'s `['orders', 'export', 'count', …]` shares the
  prefix but isn't a list page.
- Invalidating `['order', id]` covers that order's activity, tracking, notes and
  payments keys by prefix.
- Save errors show inline under the input, not as a toast; the editor stays open
  with the typed value. Success shows a toast.
- The mobile card's Article No. line now shows whenever the user can edit, so
  `+ Add Article No.` is reachable. For other users it only shows when a number
  exists, as before.

**Verification (not done yet — never against the live Neon DB)**

Backend behavior: automated script against the local Docker DB (in progress),
covering every row below that the API can observe, plus a forced-failure
rollback test. The rollback test makes the transaction fail after the Article No.
and dispatch writes, then checks that the Article No., delivery status, order
status, tracking and activity are all unchanged.

UI-only rows (Enter/Esc, mobile card, page/filter preservation, editor states):
check in the browser against the same local DB.


- [ ] Empty → valid number on a Not Dispatched order: Dispatched, 📍 Kanina Post Office in the timeline, 3 activity rows, order status Confirmed
- [ ] Different number on an already-set order: number only, no new tracking row
- [ ] Clearing the number: number removed, status unchanged
- [ ] Cancelled order + number: no dispatch
- [ ] Already Dispatched / In Transit + number: number only
- [ ] Invalid format (e.g. `12345`): error shown, editor stays open with the typed value
- [ ] Lowercase input is saved uppercase
- [ ] Same number (or same number in lowercase) + Save: editor closes, no request, nothing in activity/tracking
- [ ] Old non-conforming number (e.g. `DTDC123456789`) opened and saved unchanged: no error
- [ ] User without `delivery:update`: no edit controls; API returns 403
- [ ] Enter saves, Esc cancels; saving state shown on the row being saved
- [ ] Mobile card: editing doesn't open the order
- [ ] Page 3 + filters + sort → save → still page 3 with the same filters and sort; row updates instantly
- [ ] Order Details: entering the number there auto-dispatches too
- [ ] Change Delivery Status → Dispatched / In Transit with empty location: saves; no 📍 in the timeline
- [ ] Regression: manual status change, Add Location Update, payment on Delivered, stock restore on Returned
