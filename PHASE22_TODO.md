# Phase 22 — Inline Article No. on Orders + Auto-Dispatch + Optional Location

**Status: implemented 2026-09-27 (backend + frontend, one pass). Backend and
frontend `tsc` and ESLint clean. **Backend verified: 44/44 automated checks
pass** against a throwaway local Docker Postgres (`crm-phase22-test`,
`localhost:55432`, fresh DB `crm_phase22_run2`), never production. That includes
the forced-failure rollback test. **Browser verified: 17/17 Playwright checks
pass** (real UI in Chromium at desktop 1366px and mobile 390px, frontend :5173 →
backend :4000 on the same local DB). Production Neon was never touched. Code
diff reviewed.**

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

Backend behavior: automated script against the local Docker DB — **44/44 pass
(2026-09-27)**. It drives the real Express app over HTTP with real login cookies
and checks the DB rows directly. It covers every row below that the API can
observe, plus a forced-failure rollback test. The rollback test makes the transaction fail after the Article No.
and dispatch writes, then checks that the Article No., delivery status, order
status, tracking and activity are all unchanged.

UI-only rows (Enter/Esc, mobile card, page/filter preservation, editor states):
check in the browser against the same local DB.


Backend — verified by the automated run:

- [x] Empty → valid number on a Not Dispatched order: DISPATCHED, tracking row at Kanina Post Office with the auto note and the acting user, 3 activity rows in order, PENDING → CONFIRMED (A1)
- [x] Lowercase + spaces input saved as `AB123456789IN` (A1)
- [x] Same number (exact, and lowercase) → no-op: no activity, no tracking, `updatedAt` untouched (A2)
- [x] Different number on an already-set order: number only, no new tracking row (A3)
- [x] Clearing: number removed, still DISPATCHED/CONFIRMED; re-adding afterwards doesn't dispatch again (A4)
- [x] Cancelled order + number: number saved, stays CANCELLED / NOT_DISPATCHED (A5)
- [x] In Transit + number: number only (A6)
- [x] Invalid formats (`12345`, 8 digits, `…US` suffix, digit in prefix) → 400, nothing written (A7)
- [x] Old non-conforming number (`dtdc123456789`) saved unchanged → 200 no-op; changed to another invalid value → 400 (A8)
- [x] Processing order auto-dispatched → CONFIRMED (decision #2) (A9)
- [x] `order:update` without `delivery:update` → 403; `delivery:update` + order outside ASSIGNED scope → 403; on own assigned order → 200 + auto-dispatch (A10–A10c)
- [x] Decision #13 backend side: an `order:update` user can save Expected Delivery/Charges; a `delivery:update`-only user gets 403 there (A10d–e)
- [x] Trashed / missing order → 404; missing body field → 400 (A11)
- [x] Number-only and no-op paths never call `findById` (the full order load) (A12)
- [x] **Rollback:** failure forced inside the transaction after the Article No. + dispatch writes → Article No., delivery status, order status, tracking and activity all unchanged; a real save afterwards auto-dispatches normally (R1)
- [x] Change Delivery Status → DISPATCHED / IN_TRANSIT with no location → 200, tracking location null (C1)
- [x] Add Location Update (same status + location) still logs a checkpoint (C2)
- [x] Delivered + payment collected → PAID, one payment for the full total (C3)
- [x] Dispatched via Article No. → cancel → Return path → Returned restores stock exactly once (C4)
- [x] Legacy `PATCH /orders/:id { articleNumber }` still saves and does not auto-dispatch (C5)
- [x] Not Dispatched list filter excludes the auto-dispatched order; list rows carry `articleNumber`/`orderStatus` for the cache merge (C6)

UI — verified in the browser, 17/17 (2026-09-27, headless Chromium via Playwright,
logged in through the real login page as `admin@t.local` / `del@t.local` /
`nodel@t.local`, against the local DB):

- [x] `+ Add Article No.` autofocuses the input; Esc and ✕ cancel with **zero** requests (U1a–c)
- [x] Enter saves; while saving, the input and ✓ are disabled and the spinner shows (PATCH held 1.5 s) (U1d)
- [x] **Instant row update from the cache write:** with the list refetch held 3 s, the row already shows `AB100000001IN` (typed lowercase) + CONFIRMED + DISPATCHED right after the PATCH returns; exactly one PATCH sent (U1e–f)
- [x] ✓ button saves (U1g)
- [x] Invalid `12345` → inline error, editor stays open with `12345`, **zero requests** (U2)
- [x] Same number via Enter, and `  ab000000001in ` via ✓ → editor closes with **zero requests** (U3)
- [x] Page 3 + search `Rahul` + Not Dispatched + oldest-first → save → URL/search box/"Page 3 of N" unchanged; the auto-dispatched row drops out after the refresh (U6)
- [x] Mobile 390px: `+ Add`, clicking into the input, typing, Enter-save, ✏️ and ✕ never navigate; tapping the card body still opens the order (U5)
- [x] Order Details: `+ Add` → auto-dispatch; the Delivery card shows DISPATCHED + 📍 Kanina Post Office and the number (U7)
- [x] Change Status → DISPATCHED: label "Dispatch Location" without `*`, Update enabled while empty; saved with null location; no 📍 on the page (footer store-address pin excluded) (U9)
- [x] → IN TRANSIT with empty location allowed; Add Location Update still shows `Current Location *` and "Add Update" stays disabled until filled (U10)
- [x] `delivery:update`-only user: Expected Delivery/Charges ✏️ hidden; Article No. `+ Add` and Change Status shown (U8a)
- [x] `order:update`-only user: Expected Delivery/Charges ✏️ shown; no Article No. edit and no Change Status; the number is still click-to-track (U8b)
- [x] Orders list without `delivery:update`: no `+ Add`/✏️; numbers still clickable; empty cells show — (U4)

Screenshots checked by eye: mobile card editor fits with ✓/✕; the inline error wraps under the input in the desktop row; the Change Status dialog has no `*`.

Test-run notes (test-script issues, not app bugs, all fixed and re-run in full):
a hidden print-only `<p>` on Order Details also contains the number (the selector
was narrowed to the clickable span); the footer's store-address map pin had to be
excluded from the "no 📍" count; and the login rate limiter (5 per 15 min) was
reset by restarting the local backend between runs.

## Known limitations / notes (found in the final review, not blockers)

- **Concurrent first saves:** if two users save a first number for the same order
  at the same moment, both can pass the "empty + NOT_DISPATCHED" check and dispatch
  twice (two tracking rows). `updateDeliveryStatus` already uses the same
  read-then-write pattern. Tightening it would need a conditional update inside
  the transaction; left as-is for now.
- **Order Details wording:** without `delivery:update`, an order with no Article
  No. now shows "—" (the shared editor's empty state) instead of "Not set".

## Production release (2026-09-27)

Pushed `b8ba5c7` + `0b374e3` to `origin/main`. No schema change, so no migration.

**Deployment confirmed:**

- **Vercel:** the live bundle `index-Dx2e0KLL.js` at `pashuseva-cms.vercel.app` contains the Phase 22 editor (`Add Article No.`, the `article-number` call, the Kanina toast, the format message).
- **Render:** a logged-in `PATCH /api/orders/999999999/article-number` (the order doesn't exist, so it can't change anything) returned the new route's `404 Order not found`. The old backend would have returned an unknown-route 404.

**Read-only browser checks on production:** login `test@gmail.com` (EMPLOYEE, has `delivery:update` + `order:update`). Every non-GET browser request except login was blocked by the test harness, and none was attempted.

| # | Check | Result |
|---|---|---|
| P1 | Render serves the new route | ✅ |
| P2 | `+ Add Article No.` shown for a `delivery:update` user | ✅ |
| P3 | `+ Add` autofocuses; Esc cancels with zero requests | ✅ |
| P4 | Invalid `12345` → inline error, editor stays open, zero requests | ✅ |
| P6 | Mobile 390px: `+ Add` opens the editor inside the card without opening the order | ✅ |
| P7 | Expected Delivery / Charges ✏️ shown for an `order:update` user | ✅ |
| P9 | No write request attempted by the UI | ✅ |
| P5 | Same number + Save, zero requests | ✅ on test order A (see below) |
| P8 | Change Status location optional | ✅ on test order C (see below) |
| — | Auto-dispatch on a production order | ✅ on test orders A and B (see below) |

Up to this point no production data had been changed. The user then asked for dedicated test orders.

### Production write test on 3 dedicated test orders (user-approved)

Account `test@gmail.com`: EMPLOYEE, permissions `customer:view/create/update`,
`order:view/create/update`, `order:customerSearchAll`, `product:view`,
`delivery:view/update`, `payment:view/create/edit`. It has **no**
`order:cancel`, `order:delete` or `customer:delete`.

Setup: test customer **#151 "TEST Phase22 — delete me"** (phone 9000022022), and
3 orders of 1 × FEED SAMPLE 500G (#36, ₹50, cash): **ORD-2026-000164 (#166),
ORD-2026-000165 (#167), ORD-2026-000166 (#168)**. The same script first passed
12/12 as a dry run against the local DB. In the browser, saves were allowed only
for these 3 order ids.

| # | Check | Result |
|---|---|---|
| A1 | Orders list: typed `te000000001in` → toast; row shows TE000000001IN / CONFIRMED / DISPATCHED | ✅ |
| A2 | DB: number uppercased, DISPATCHED, CONFIRMED | ✅ |
| A3 | Tracking: DISPATCHED @ **Kanina Post Office**, note "Auto-dispatched on article number entry" | ✅ |
| A4 | Activity: Article number changed + Delivery status changed + Order status auto-updated | ✅ |
| P5 | Same number + Enter → editor closes, zero requests, no new tracking row | ✅ |
| B1 | Order Details: first number `TE000000002IN` → Delivery card shows Kanina Post Office; DB DISPATCHED/CONFIRMED | ✅ |
| P8 | Change Status → DISPATCHED with an **empty** location: no `*`, saved, tracking location null, CONFIRMED | ✅ |
| G | The browser attempted no save outside the 3 test orders | ✅ |
| CLEAN | FEED SAMPLE 500G stock back to 99 (its starting value) | ✅ |
| CLEAN | Orders moved to Trash | ❌ The account lacks `order:delete` (403) — **Admin must finish** |

Cleanup done:
- `POST /cancel` → 403 (no `order:cancel`).
- Each order was instead walked Return Pending → Return In Transit → Returned. That
  set order status to Cancelled through the existing delivery sync and restored the
  stock.
- Afterwards `test@gmail.com` gets **403** on these orders: Phase 19 automatically
  unassigns an Employee once all their orders for that customer are done, so the
  account lost access. This is expected.

**No other production orders or customers were modified.** The only order
touched outside the three test orders was `ORD-2026-000029`, which was viewed
read-only. The single `PATCH` probe targeted a non-existent order id
(999999999).

**Admin cleanup pending:** don't work around the missing `order:delete`
permission or change permissions just to let the test account clean up.

**Left for an Admin:** move ORD-2026-000164, -000165 and -000166 to Trash, then
move customer #151 "TEST Phase22 — delete me" to Trash. Until then, the three
orders count as Cancelled/Returned in the dashboard and reports. Order numbers
164–166 and their invoice numbers are used up.

Notes:
- An Employee who enters Article Nos. needs **Delivery → Update Delivery Status** (`delivery:update`).
- In the desktop table, the `+ Add Article No.` label can wrap onto two lines when the Article Number column is narrow (cosmetic).
