# Phase 27 — Trash Detail: open any trashed item (Admin-only)

**Status: implemented and verified locally 2026-10-05. Never run against production.
Not committed.**

- On a throwaway Docker Postgres (`localhost:55432`):
  - **Backend: 21/21.**
  - **Regression:** Phase 22 44/44, Phase 23 19/19, Phase 24 23/23.
  - **Browser: 9/9** in one clean run.
- `tsc` and ESLint clean.

Every row in Trash becomes openable: an Admin can click a trashed Customer, Order,
Product or Employee/Manager and see its full details, its deletion info, and the
Restore / Delete Permanently actions. **Normal detail pages and APIs keep treating
trashed records as 404** — trashed records are only reachable through a separate,
Admin-only Trash Detail flow.

## The request, as given (summary of the agreed architecture)

```
/trash ── row click ──► /trash/:type/:id  (customer | order | product | employee)
                              │
                     Trash Detail page (Admin only)
                     ├── Restore → back to the normal detail/list page
                     └── Delete Permanently (type DELETE) → back to /trash
```

- **One new endpoint,** `GET /api/trash/:type/:id`, under the existing
  `requireRole('ADMIN')`.
- **Detail lookups bypass the normal `deletedAt: null` filters,** then require
  `deletedAt` set **and not purged**; otherwise → 404.
- **Response wrapper:** `{ type, record, trash: { deletedAt, deletedBy, deletionExpiresAt, daysRemaining } }`.
- **Fix the existing weakness at the same time:** restore and permanent-delete must
  also refuse purged records → 404.
- **No new permission:** Trash stays Admin-only (Manager/Employee → 403).

## Current structure (checked against the code)

| Piece | Today |
|---|---|
| Trash API | `GET /api/trash`, `POST /api/trash/:type/:id/restore`, `POST /api/trash/:type/:id/permanent-delete` (body `{confirm:"DELETE"}`) — all `requireRole('ADMIN')` |
| Trash page | `frontend/src/pages/Trash.tsx`: tabs All / Customers / Orders / Products / Employees; Restore + Delete Permanently per row; rows not clickable |
| `findTrashedById` (customer/order/user/product repositories) | `deletedAt: { not: null }` only — **doesn't exclude `purgedAt`** (customer/order/user), so restore / permanent-delete by direct API call can act on an already-purged record |
| Detail pages | `/customers/:id`, `/orders/:orderNumber`, `/products/:id`; **no Employee detail page** (only the `/employees` list) |
| Data per entity | Customer: phones, addresses, notes, activity, assigned employees/manager, orders. Order: items, address, payments, tracking, activity, notes, assigned employees. Product: category, stock history, activity. User: role, email, phone, status, managers/team, assigned customers/orders, audit-log entries |
| Product fields | name, SKU, description, category, price, weight (value + unit), packaging unit, available stock, minimum stock, image, active |

## Corrections to the proposed plan

| Proposed | Actual | Plan now |
|---|---|---|
| Product: Dealer Price, Discount Price, Size, Status | Those fields don't exist | Show the real fields (table above); "Status" = Active / Inactive |
| Restore Employee → `/employees/:id` | No Employee detail page | Redirect to `/employees` |
| Restore Order → `/orders/:id` | Order Details is keyed by order number | Redirect to `/orders/:orderNumber` |
| Activity for every entity | Users have no activity table | Employees show audit-log entries about them; Customers/Orders also show notes; Orders also show payments + delivery tracking |

## Shape

### Backend

| File | Change |
|---|---|
| `routes/api/trash.ts` | `GET /:type/:id` (inside the existing Admin-only router) |
| `controllers/trash.controller.ts` | `detail` → `trashService.getTrashDetail(type, id)` |
| `services/trash.service.ts` | `getTrashDetail`: per-type lookup with **no** `deletedAt: null` filter; require `deletedAt != null` and (customer/order/user) `purgedAt == null`; 404 otherwise; wrap as `{ type, record, trash }` with `daysRemaining` |
| repositories (customer/order/product/user) | `findTrashedDetail(id)` — full includes for the detail view; **and** `findTrashedById` tightened to `purgedAt: null` (customer/order/user) so restore / permanent-delete refuse purged records |

Per-type `record` contents:

| Type | Includes |
|---|---|
| customer | phones, addresses, notes, activity, assigned employees/manager, **all its orders** (each flagged if itself trashed) |
| order | customer (flagged if trashed), items, address, payments (+ paid/remaining), tracking, activity, notes, assigned employees |
| product | category, all fields above, stock history, activity |
| employee | name, role (Employee/Manager), email, phone, status, managers / team members, assigned-customer and active-order counts, audit-log entries about this user; **never `passwordHash`** |

### Frontend

| File | Change |
|---|---|
| `App.tsx` | Admin-only route `/trash/:type/:id` → `TrashDetail` |
| `pages/Trash.tsx` | Whole row clickable → `/trash/:type/:id`, plus a **View** button; Restore / Delete keep working without opening the row (clicks don't bubble) |
| `pages/TrashDetail.tsx` (new) | Fetches `GET /api/trash/:type/:id`; renders the shared layout + the per-type sections |
| `components/trash/TrashDetailLayout.tsx` (new) | Back to Trash, title ("Deleted Customer / Order / Product / Employee / Manager"), **TRASHED** badge, deleted at / by / expires in N days, Restore + Delete Permanently |
| `components/trash/{Customer,Order,Product,Employee}TrashDetail.tsx` (new) | Read-only sections per type. Links: an order's customer → `/customers/:id` if active, `/trash/customer/:id` if trashed (same for a customer's orders) |
| States | Loading; **404 → "This item is no longer in Trash — it may have been restored or permanently deleted." + Back to Trash**; 403 → no permission; error → Try again |
| After Restore | Toast, then go to Customer `/customers/:id`, Order `/orders/:orderNumber`, Product `/products/:id`, Employee `/employees` |
| After Delete Permanently | Toast, then go to `/trash`; refresh list + sidebar count |
| Race with the hourly purge | A restore / delete / detail request that gets 404 shows "already permanently removed" and returns to `/trash` |

## Not in scope (separate follow-ups)

- Trashing a **Not Dispatched order doesn't restore its stock** (and purging makes
  that permanent) — found while documenting the Trash architecture.
- The other open follow-ups (test-account permissions, Admin correction can
  un-cancel, Cancel Order button permission, simultaneous submissions,
  "—" vs "Not set").

## TODO checklist

**Backend**
- [x] `GET /api/trash/:type/:id` + `getTrashDetail` + per-type `findTrashedDetail`
- [x] Tighten `findTrashedById` to exclude purged (customer/order/user)
- [x] `tsc` / lint

**Frontend**
- [x] Route + `TrashDetail` + layout + 4 per-type sections
- [x] Trash rows clickable + View; actions don't open the row
- [x] Restore / Delete from the detail page with the redirects above; loading / 404 / 403 / error states
- [x] `tsc` / lint

**Verification (local Docker DB only)**
- [x] Per type: trash → open from Trash → details correct → Restore → lands on the normal page; another → Delete Permanently → back to Trash
- [x] Security: Manager / Employee → 403 on `GET /api/trash/:type/:id`; active record → 404; random id → 404; purged record → 404 on detail, restore **and** permanent-delete
- [x] Normal APIs still 404 for trashed records (`/api/customers/:id`, `/api/orders/:id`, …)
- [x] Purge race: open detail → purge → Restore → "already permanently removed" → /trash
- [x] Customer ↔ order links go to the Trash or normal page as appropriate
- [x] Regression: existing Trash list / restore / delete; Phase 22–26 suites

### Results

**Backend 21/21** (fresh DB `crm_phase27`, real HTTP routes):
- **Setup:** order / customer / product / employee trashed through the normal endpoints.
- **Detail per type:** the `{type, record, trash}` wrapper with deletedBy, expiry and
  days left.
  - Customer: phones, address, email, and both of its orders (the trashed one flagged).
  - Order: items, payments with paid / remaining, tracking, notes, activity; customer
    flagged as trashed.
  - Product: category, price, stock, stock history, activity.
  - Employee: role, email, counts, audit entry "Deleted Employee", **no `passwordHash`**.
- **Security:**
  - Manager and Employee (even with every business permission) → **403**.
  - Active record → 404; random id → 404; unknown type → 400.
  - The normal detail APIs **still 404** trashed records.
- **Restore** → the normal API is 200 again and the Trash detail 404s.
- **Purged** customer / order / employee: detail, restore **and** permanent-delete all
  → **404**; the purged customer stays anonymized. Purged product (row deleted) → 404.
  Before this phase, restore / permanent-delete only checked `deletedAt`, so they could
  act on a purged record — found by reading the old code; not re-run against it.
- **Lists and sweep:** the Trash list excludes all purged items; the hourly sweep
  (`purgeExpired`) still purges an expired item, which then 404s.

**Regression:** Phase 22 44/44, Phase 23 19/19, Phase 24 23/23 (fresh DBs).

**Browser 9/9** (Admin; one Employee check), in one clean run:
- **T1:** row click → `/trash/order/:id`; "Deleted Order", TRASHED badge, days left, sections; active customer → `/customers/:id`.
- **T2:** in the list, Restore / Delete dialogs (incl. Cancel) never open the row; **View** opens it.
- **T3:** trashed customer shows both orders; the trashed one → `/trash/order/:id`, the active one → `/orders/:orderNumber`; the order's customer link then → `/trash/customer/:id`.
- **T4–T6:** Restore from the detail → `/customers/:id`, `/products/:id`, `/orders/:orderNumber` (each page loads).
- **T7:** "Deleted Manager" (+ Team) and "Deleted Employee" (reports to, audit history); Delete Permanently needs `DELETE` → `/trash`, row gone; Restore Manager → `/employees`.
- **T8:** missing id → "no longer in Trash" + Back to Trash; item purged while open → Restore shows "already permanently removed" → `/trash`.
- **T9:** Employee opening `/trash/order/:id` sees no order data; the API returns 403.

**Test-script issues only (fixed):** creating an Employee as Admin requires a Manager
(`managerId`), so T7 creates one first; "Deleted Employee" appears both as the
heading and as an audit-log row, so the selector targets the heading. The local
login limiter was reset by restarting the local backend between runs.
