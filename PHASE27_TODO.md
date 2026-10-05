# Phase 27 — Trash: Trash Detail (Admin-only) + 30-day recovery window

**Status: both parts released and verified on production 2026-10-05.**

This document combines two Trash changes. The 30-day change was first numbered
Phase 29 and merged into this file as Part B. The number Phase 29 has since been
reused for a different change (`PHASE29_TODO.md`: Prisma migrations over Neon's
direct connection).

| Part | What | Commits | Production |
|---|---|---|---|
| **A — Trash Detail** (original Phase 27) | Open any trashed item from Trash in an Admin-only detail page; Restore / Delete Permanently from it; restore / permanent-delete now refuse already-purged records | `b173cbc` docs, `f447c24` code | ✅ Verified by the user from an Admin account |
| **B — 30-day window** (formerly Phase 29) | Trash recovery window 10 → 30 days, including items already in Trash (data migration) | `dac5bea` docs, `6e26507` code + migration | ✅ Live after one failed first deploy (Prisma lock timeout); texts + Admin spot-check verified |

The migration `20261005120000_trash_retention_30_days` still says "Phase 29" in its
comment — there it means **Part B** below. (The two code comments that said the
same now say "Phase 27 Part B".) (The applied migration file
must never be edited: Prisma checksums applied migrations.)

---

## Part A — Trash Detail: open any trashed item (Admin-only)

- On a throwaway Docker Postgres (`localhost:55432`):
  - **Backend: 21/21.**
  - **Regression:** Phase 22 44/44, Phase 23 19/19, Phase 24 23/23.
  - **Browser: 9/9** in one clean run.
- `tsc` and ESLint clean.
- Results below mention "10 days left" — that was the window at the time; Part B
  changed it to 30.

Every row in Trash becomes openable: an Admin can click a trashed Customer, Order,
Product or Employee/Manager and see its full details, its deletion info, and the
Restore / Delete Permanently actions. **Normal detail pages and APIs keep treating
trashed records as 404** — trashed records are only reachable through a separate,
Admin-only Trash Detail flow.

### The request, as given (summary of the agreed architecture)

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

### Current structure (checked against the code)

| Piece | Today |
|---|---|
| Trash API | `GET /api/trash`, `POST /api/trash/:type/:id/restore`, `POST /api/trash/:type/:id/permanent-delete` (body `{confirm:"DELETE"}`) — all `requireRole('ADMIN')` |
| Trash page | `frontend/src/pages/Trash.tsx`: tabs All / Customers / Orders / Products / Employees; Restore + Delete Permanently per row; rows not clickable |
| `findTrashedById` (customer/order/user/product repositories) | `deletedAt: { not: null }` only — **doesn't exclude `purgedAt`** (customer/order/user), so restore / permanent-delete by direct API call can act on an already-purged record |
| Detail pages | `/customers/:id`, `/orders/:orderNumber`, `/products/:id`; **no Employee detail page** (only the `/employees` list) |
| Data per entity | Customer: phones, addresses, notes, activity, assigned employees/manager, orders. Order: items, address, payments, tracking, activity, notes, assigned employees. Product: category, stock history, activity. User: role, email, phone, status, managers/team, assigned customers/orders, audit-log entries |
| Product fields | name, SKU, description, category, price, weight (value + unit), packaging unit, available stock, minimum stock, image, active |

### Corrections to the proposed plan

| Proposed | Actual | Plan now |
|---|---|---|
| Product: Dealer Price, Discount Price, Size, Status | Those fields don't exist | Show the real fields (table above); "Status" = Active / Inactive |
| Restore Employee → `/employees/:id` | No Employee detail page | Redirect to `/employees` |
| Restore Order → `/orders/:id` | Order Details is keyed by order number | Redirect to `/orders/:orderNumber` |
| Activity for every entity | Users have no activity table | Employees show audit-log entries about them; Customers/Orders also show notes; Orders also show payments + delivery tracking |

### Shape

#### Backend

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

#### Frontend

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

### Not in scope (separate follow-ups)

- Trashing a **Not Dispatched order doesn't restore its stock** (and purging makes
  that permanent) — found while documenting the Trash architecture.
- The other open follow-ups (test-account permissions, Admin correction can
  un-cancel, Cancel Order button permission, simultaneous submissions,
  "—" vs "Not set").

### TODO checklist

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

#### Results

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

### Production release (2026-10-05)

Pushed with Phase 28: `b173cbc` (docs) + `f447c24` (code), at 22:44. Vercel served the
new bundle `index-D7RaHtjw.js` (contains the Trash detail page) at 22:44:37.

**Pre-push review (re-confirmed):**
- `GET /api/trash/:type/:id` sits behind the router-wide
  `requireRole('ADMIN')`; Manager / Employee get 403 (backend S, browser T9).
- Normal detail APIs still 404 trashed records (backend S).
- Restore / permanent-delete 404 on purged records (backend P).
- The employee detail uses an explicit select without `passwordHash`, and the
  response was checked for it (backend D).

**Production check: NOT RUN.** Trash is Admin-only, and the only production account
available here (`test@gmail.com`) is an Employee. The Admin-only restriction was not
weakened to test it, and an Employee check can't distinguish the old backend from
the new one (both 403). The local backend 21/21 and browser 9/9 runs cover the
workflow. **Render deployment of `f447c24` is therefore not confirmed from here** —
the frontend is.

**To verify on production** (Admin): Trash → click a row (or View) → the detail
page shows the TRASHED badge, deletion info and the sections → Restore → you land
on the normal page. Or provide an Admin login and the same scripted check can run
on one dedicated test customer.

**Production check — DONE (2026-10-05), by the user from an Admin account:**
opened a trashed item from Trash; the Trash Detail page opened with the TRASHED
badge and the item's details, and works correctly. This also confirms the Render
backend is serving the new `GET /api/trash/:type/:id` (the old backend had no such
route).

---

## Part B — Trash recovery window: 10 days → 30 days (formerly Phase 29)

- On a throwaway Docker Postgres (`crm-phase29-test`, `localhost:55432`):
  - **Migration + behaviour: 9/9.**
  - **Part A's Trash suite: 21/21** (its expectation updated from 10 to 30 days left).
- `tsc` and ESLint clean (0 errors).

### The request, as given

Change the Trash window from 10 days to 30 days.

**Decision (asked):** items **already in Trash** get the new window too — expiry =
their deletion date + 30 days — not just items trashed after the release.

### What changes

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

### Deployment note

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

### TODO checklist

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
- [x] Regression: Part A's Trash suite 21/21
- [x] Release + production check (see below), incl. the Admin Trash spot-check

### Production release (2026-10-05)

Pushed `dac5bea` (docs) + `6e26507` (code + migration) at 23:05 IST.

**Frontend (Vercel):** new bundle `index-CZ7QClDT.js` served at 23:05:51; its
"Move to Trash" texts use the 30-day constant.

**Backend (Render), first deploy FAILED** (23:07 IST, "Exited with status 1"):

- `prisma migrate deploy` (the start command's first step) failed every retry with
  **P1002 — timed out acquiring a Postgres advisory lock**
  (`SELECT pg_advisory_lock(72707369)`, 10 s). The server never started, and Render
  kept the previous backend.
- **Cause:** `DATABASE_URL` uses Neon's **pooled** host (`…-pooler…`). Prisma's
  migration lock is a session-level Postgres advisory lock, which is unreliable
  through a connection pooler. Most likely an earlier attempt applied the migration
  and its lock stayed held on a pooled connection, so the retries couldn't acquire it.
- **Evidence the migration was already applied:** in the same logs, a later run of
  the new code (`29 migrations found`) reported **"No pending migrations to apply."**
- **In between:** the old backend was live — new deletions briefly still got 10
  days while the screens said 30.

**Backend redeployed manually: LIVE at 23:12 IST** ("Deploy live for 6e26507").
The start command only starts the server after `prisma migrate deploy` succeeds,
and that succeeds only when every migration in the folder is applied — so this
**confirms `20261005120000_trash_retention_30_days` is applied in production.**

**Production checks (read-only, `test@gmail.com`, all writes blocked; nothing deleted):**

| # | Check | Result |
|---|---|---|
| F1 | Customer "Move to Trash" confirmation: "…You can restore it within **30 days**." — Cancelled | ✅ |
| F2 | Order "Move to Trash" confirmation: "…You can restore it within **30 days**." — Cancelled | ✅ |
| G | No write attempted | ✅ |
| M | Migration applied in production | ✅ (deploy live with the migration present; see above) |
| A | Admin spot-check in Trash: each item's expiry ≈ deletion date + 30 days (e.g. deleted 5 days ago → 25 days left) | ✅ Confirmed by the user from an Admin account (2026-10-05) |

**Follow-up (recommended, separate change):** run migrations over Neon's **direct**
(non-pooled) connection so this lock problem can't recur. Add a `DIRECT_URL`
environment variable in Render (Neon's connection string **without** `-pooler`), and
point `prisma.config.ts`'s migrate datasource at it; the app keeps the pooled URL.

