# Phase 9 — Dashboard & Reports

## Status: done (2026-08-20)

Spec pasted 2026-08-20. Cross-checked against the current codebase: order/customer
list queries already role-scope automatically (Admin sees everything, Manager sees
their team, Employee sees only what's assigned to them — `buildOrderWhere` /
`buildCustomerWhere` in the respective services), so the dashboard/reports layer can
reuse that scoping instead of reinventing it. Low/out-of-stock product queries already
exist from Phase 8.

## Scope decisions (flagging before building, not silently deciding)

- **"Pending Follow-ups" (spec §17/§18, Employee dashboard) — omitted.** No
  follow-up/task entity exists anywhere in this app yet. Building one would be a new
  domain feature, not a dashboard surfacing of existing data — out of scope for a
  "summarize what's already there" phase. Everything else in the Employee dashboard
  (My Customers, My Orders, Orders In Transit/Delivered) maps directly to the existing
  scoped order/customer queries.
- **Reports/full dashboard visibility gated by role, not a new permission.** The
  spec's own access table for Phase 9 is role-based (Admin/Manager see Reports,
  Employee doesn't), not permission-based — matches how Employees/Categories pages
  already gate on `requireRole('ADMIN','MANAGER')` rather than inventing a permission
  nobody asked for.
- **Export: CSV only, generated client-side from already-filtered data.** No backend
  export endpoint, no Excel/PDF (those need new dependencies — `xlsx`, a PDF
  generator — for a "keep it simple" phase). Each report's filtered rows are already
  fetched via the existing `/orders`, `/customers`, `/products` list endpoints; Export
  CSV just serializes what's on screen.
- **One simple inline sales chart, no charting library.** No chart lib is currently
  installed; adding one (recharts etc.) for a single 7-day line is disproportionate.
  A small hand-rolled SVG sparkline covers the spec's "one simple sales chart, don't
  build charts for decoration" guidance.
- **"Sales" = sum of non-cancelled `Order.total`.** This app has no separate
  payment/invoice ledger; `Order.total` is already the authoritative revenue figure
  used everywhere else (Orders list, Order Detail). Today/This Week/This Month use
  calendar boundaries (week starts Monday, month starts the 1st) — the same
  definitions the Sales Report's date-range filter uses, so the dashboard's compact
  numbers and the full report agree.

## Backend

1. `GET /api/dashboard/summary` — one role-scoped endpoint returning everything the
   dashboard needs in a single round trip (spec §21's explicit performance ask): today's
   new customers/orders, sales today/this week/this month, order counts by
   `orderStatus` and by `deliveryStatus`, low/out-of-stock counts, recent orders (5),
   recent customers (5), top products (5, by quantity sold). All counts reuse the
   existing role-scoping helpers so Employee automatically only sees their own.
2. `GET /api/reports/sales?range=&from=&to=` — total orders, total sales, average order
   value, and a daily sales breakdown (for the sparkline) over the range.
3. `GET /api/reports/orders?range=&status=&employeeId=&customerId=` — counts by status
   and delivery status over the range/filters.
4. `GET /api/reports/customers?range=` — total/new/active customer counts + top
   customers by total spend.
5. `GET /api/reports/products` — total/active/low-stock/out-of-stock counts + best
   selling products.
6. All four report endpoints and the dashboard summary apply the same role scoping as
   the existing list endpoints (Admin all, Manager their team, Employee their own).
   Gated by `requireRole('ADMIN','MANAGER')` — Employees don't get a Reports page per
   the spec's role table, only the dashboard summary (rendered as their smaller "My
   Work" view).

## Frontend

7. **Dashboard rewrite** (`Home.tsx`, still mounted at `/`) — role-aware:
   - Admin/Manager: greeting header, 4 summary cards (Customers/Orders/Sales/Pending),
     Today's Overview list, Sales Summary (+ sparkline), Orders Overview (click a
     status → `/orders?orderStatus=X` or `?deliveryStatus=X`), Low Stock / Out of
     Stock (already exists from Phase 8, kept), Recent Orders, Recent Customers, Top
     Products, Quick Actions (permission-gated).
   - Employee: smaller "My Dashboard" — My Customers, My Orders, Orders In
     Transit/Delivered, Recent Customers, Quick Actions.
8. **Orders page** — read `orderStatus`/`deliveryStatus`/etc. from the URL query
   string on load (currently local-state only), so a dashboard link like
   `/orders?deliveryStatus=IN_TRANSIT` arrives pre-filtered, per spec §4/§5.
9. **`/reports` page** (Admin/Manager only, new Sidebar entry) — four sections (Sales,
   Orders, Customers, Products) switched by a simple in-page tab control (no new UI
   library — this app doesn't have Radix Tabs installed and one hand-rolled toggle
   isn't worth adding a dependency for), each with its own date-range/filter controls
   and an Export CSV button.
10. **Quick Actions widget** — Add Customer / Create Order / Add Product buttons,
    each shown only if the user holds the matching `*:create` permission.

## Explicitly not doing

Per spec §20/§14-style guidance carried over from Phase 8: no follow-up/task system,
no Excel/PDF export, no charting library, no per-widget configurability. Numbers +
lists + status indicators, not a BI dashboard. Orders Report also skips a Customer
filter (Date/Status/Employee are supported) — a customer picker felt disproportionate
for a report filter and wasn't the part of §12 doing the real work.

## Extra fix made along the way

While building the dashboard's low-stock numbers, found that `productService.list`'s
`stock=low` filter (added in Phase 8) applied pagination *before* the in-memory
low-stock filter, so `total` under-counted as soon as there were more products than
one page. Fixed by fetching all matching rows unpaginated, filtering, then paginating
the filtered set (`productRepository.findAllMatching` +
`product.service.ts`'s `list`). Verified live: with 2 low-stock products and
`pageSize=1`, `total` now correctly reports 2 instead of 1.

## Verified

Backend `tsc`/`eslint` clean, frontend `tsc`/`eslint`/`vite build` clean. Live-tested
`/dashboard/summary`, all four `/reports/*` endpoints, and the low-stock count fix
against the real DB with real orders/customers/products. Test data (stock levels)
reset back afterward.

## Refinement pass (2026-08-20)

Following review feedback, before calling Phase 9 done:

- **Metric definitions centralized.** New `backend/src/lib/orderMetrics.ts` — one
  `salesEligibleFilter` (excludes CANCELLED) used everywhere money or "units sold" is
  aggregated (dashboard sales, Sales Report, Customer Report's top spenders, Top
  Products/Best Selling). Counts that are just "how many orders exist" (Total Orders,
  Orders Report's `byStatus`, Recent Orders) intentionally do *not* filter — cancelled
  orders still exist, they just didn't sell anything.
- **Real bug fixed**: `topProducts`/"Best Selling" was counting items from cancelled
  orders as sold — found while centralizing the definition above. Verified live:
  quantity sold dropped from 15 to 10 once cancelled-order items were correctly
  excluded.
- **Employee API authorization verified directly**, not just via UI hiding: created a
  throwaway Employee account, confirmed `GET /dashboard/summary` succeeds (scoped) and
  all four `GET /reports/*` return 403. Test account deactivated afterward.
- **Products page now reads `?stock=low|out` from the URL** (mirroring what Orders
  already did for `orderStatus`/`deliveryStatus`), so Low Stock/Out of Stock links from
  the Dashboard and the Products Report both land pre-filtered instead of a bare
  `/products`.
- **Friendlier empty states**: a dedicated "No orders yet" banner replaces the whole
  Today/Sales/Orders/Delivery block when a scope has zero orders (instead of a wall of
  ₹0s), same for Employee's "nothing assigned yet." Recent Orders/Customers/Top
  Products empty messages now say what will appear and when, not just "No X yet."
- **Last updated + manual refresh** added to the dashboard header, backed by React
  Query's own `dataUpdatedAt`/`refetch` — no new polling or WebSockets.
- **Partial-failure handling considered, not built**: the dashboard is intentionally
  one consolidated `/dashboard/summary` call (the spec's own §21 recommendation), so
  there's no "Summary ✅, Recent Orders ❌" scenario to isolate — if the endpoint fails,
  everything in it fails together, which is what the current single ErrorState+Retry
  already does. Splitting it into per-widget calls just to enable partial failure would
  undo the "one round trip" decision for no real benefit at this scale. The Reports
  page's four tabs *are* independent calls and already fail/retry independently.
- Excel/PDF export, advanced analytics, forecasting, profit/CLV metrics, follow-ups,
  new dashboard-specific permissions, and WebSockets remain explicitly out of scope, as
  reaffirmed in the review.
