# About — TODOs and Progress

This file documents the full TODO list for the CRM project, from the initial spec through the completed Phase 1 and Phase 2 scaffolding. Each entry includes the current status and a short note explaining the item.

---

## High-level Phases (end-to-end)

1. Phase 1 — Project Foundation (completed)
2. Phase 2 — Database + Backend Architecture (in-progress / initial scaffold completed)
3. Phase 3 — Authentication, Authorization, Roles & Permission Management (completed)
4. Phase 4 — Customers Module (completed)
5. Phase 5 — Products + Categories (completed)
6. Phase 6 — Orders Module (completed)
7. Phase 7 — Delivery Tracking & Status Management (completed 2026-08-19 — manual/repeatable status selection, a separate "Add Location Update" action, a "Received By" field, and `delivery:update` permission gating; see `PHASE7_TODO.md`)
8. Phase 8 — Inventory & Stock Management (completed 2026-08-19 — stock lives on Product, not a separate module; see `PHASE8_TODO.md`)
9. Phase 9 — Dashboard & Reports (completed 2026-08-20 — see the "Phase 9" section below and `PHASE9_TODO.md`)
10. Phase 10 — Notifications & Communication (**deferred** 2026-08-20 — curated into `PHASE10_TODO.md`, not built; the app doesn't need a notification system at this size yet — see the "Phase 10" section below)
11. Phase 11 — Advanced Customer & Order Management (completed 2026-08-20 — see the "Phase 11" section below and `PHASE11_TODO.md`)
12. Phase 12 — Suppliers & Purchase Management (**deferred** 2026-08-20 — curated into `PHASE12_TODO.md`, not built; the incoming-stock counterpart to Phase 8, not needed yet — see the "Phase 12" section below)
13. Phase 13 — Invoice & Payment Management (completed 2026-08-20 — see the "Phase 13" section below and `PHASE13_TODO.md`)
14. Phase 14 — System Polish & Business Workflow Improvements (curated 2026-08-20, real gaps done 2026-08-20; hardening/polish only, no new module; see the "Phase 14" section below and `PHASE14_TODO.md`)
15. Phase 15 — New User Signup & Approval Workflow (completed 2026-08-21, extended mid-build into Role+Permissions+Data Scope; see the "Phase 15" section below and `PHASE15_TODO.md`)
16. Phase 3 Addendum — Trash / Recycle Bin & Soft Delete (completed 2026-08-21; see the "Trash / Recycle Bin" section below and `PHASE16_TODO.md`)

Security & Testing and Performance & Production Deployment (the original generic
placeholders that used to occupy this slot) remain unnumbered future work, not
currently curated — much of their intent is actually covered by Phase 14's security/
performance sections instead.

Search/Filters/Import-Export (an older generic placeholder that used to occupy this
Phase 12 slot) remains an unnumbered future idea, not currently curated.

---

## Completed / In-progress Work (detailed)

- Create `crm.md` with full spec
  - Status: completed
  - Notes: Full product requirements and data model stored in `crm.md`.

- Project Foundation (Phase 1)
  - Status: completed
  - Notes: Repository skeleton, tooling, frontend and backend scaffolds, ESLint/Prettier, VSCode settings.

Backend Phase 1 items (completed):

- Backend: TypeScript + Express setup
  - Files: `backend/src/index.ts`, `backend/src/app.ts`
  - Status: completed
- Backend: Add Prisma schema & initial models
  - Files: `backend/prisma/schema.prisma`
  - Status: completed
- Backend: Add dev scripts & README
  - Files: `backend/package.json`, `backend/README.md`
  - Status: completed
- Backend: Add Prisma client wrapper (`src/lib/prisma.ts`)
  - Status: completed
- Backend: Document Prisma client location in README
  - Status: completed

Frontend Phase 1 items (completed):

- Frontend: Vite + React + TypeScript + Tailwind scaffold
  - Files: `frontend/package.json`, `vite.config.ts`, `tailwind.config.cjs`
  - Status: completed
- Frontend: Add basic layout components (Sidebar, Navbar, PageContainer)
  - Files: `frontend/src/components/*`
  - Status: completed
- Frontend: Add UI component placeholders (Card, Button, Table, Dialog, Toast)
  - Files: `frontend/src/components/*`
  - Status: completed

Workspace & tooling (completed):

- Root README + `crm.md`
- `.gitignore`, `.env.example`, `.editorconfig`, `.eslintrc.json`, `.prettierrc`
- Root `package.json` with npm workspace scripts
- `.prettierignore`, `.dockerignore`

---

## Phase 2 — Database + Backend Architecture (scaffolded)

Items added in Phase 2 (status: completed for scaffolding):

- Add env validation (`backend/src/config.ts`)
  - Purpose: Validate required environment variables using Zod and expose a typed `config` object.
  - Status: completed

- Add logger (`backend/src/logger.ts`)
  - Purpose: Simple console-based logging wrapper. Replace with structured logger later.
  - Status: completed

- Add error handler middleware (`backend/src/middleware/errorHandler.ts`)
  - Purpose: Centralized error responses and logging for Express.
  - Status: completed

- Add API router and customers route (`backend/src/routes/api/index.ts`, `backend/src/routes/api/customers.ts`)
  - Purpose: Provide an `api` router with basic `/customers` endpoints (list, get). Uses Prisma client.
  - Status: completed
  - Notes: Customers endpoints are minimal read-only examples; full CRUD to implement in Phase 4.

- Add Prisma seed script (`backend/prisma/seed.ts`)
  - Purpose: Create initial development data (admin user placeholder).
  - Status: completed
  - Warning: Seed currently uses plaintext password for convenience — replace with hashing in real setups.

- Update backend README with migration & seed steps
  - Files: `backend/README.md`
  - Status: completed

---

## Current status summary

- Phase 1: **fully completed and verified against the fuller spec in `phases.md`**, including the gaps below — all closed 2026-08-18.
- Phase 2: **fully completed and verified against the fuller spec in `phases.md`**, including the gaps below — all closed 2026-08-18.
- Phase 3: **completed and verified end-to-end 2026-08-18** — see the "Phase 3" section below for full detail.
- Phase 4 & 5: **completed and verified end-to-end 2026-08-18** — see the "Phase 4 & 5" section below for full detail.
- Phase 6: **completed and verified end-to-end 2026-08-18** — see the "Phase 6" section below for full detail.
- 2026-08-17: fixed a batch of defects found when actually running the scaffold rather than trusting this doc — see "Fixes applied" below.
- 2026-08-18: fixed a critical, previously-undetected cross-cutting bug — **the backend had no CORS middleware, so the browser would have blocked every request from the frontend** despite all prior phase verification passing (curl doesn't enforce CORS; a browser does). See "CORS connectivity fix" below.
- 2026-08-18: audited every frontend route's API wiring, then closed 3 real "backend built, no UI caller" gaps (product edit, employee edit, role change) found in the process, plus one incidental backend validation bug the new product-edit UI exposed. See "Frontend route audit" below.
- 2026-08-19: built the cross-cutting "inline customer creation + global search" UX layer requested as an application-wide requirement (not just Orders) — see the "Cross-Cutting UX Upgrade" section below for full detail, including a prerequisite Employee-assignment bug fixed first and a real Prisma transaction-timeout issue hit and fixed live.
- 2026-08-19: redesigned the Order Details page and built a real delivery tracking history (status + location + note + who + when per update, not just a single field) directly on `Order`/`DeliveryTracking`, by explicit request. Order URLs switched to order-number-based (`/orders/ORD-...`). See "Order Details Redesign & Delivery Tracking History" below.
- 2026-08-19: **Phase 7 (a dedicated Delivery & Logistics module — separate `Delivery`/`DeliveryEvent`/`DeliveryAttempt`/`DeliveryPartner`/`DeliveryProof` tables, `/deliveries` pages, 8 new permissions) was built, then fully reverted the same day at explicit request** ("delete all the functionalities in phase 7, i dont want phase 7"). All Phase 7 code, schema models, routes, and doc sections were removed; `phases.md`'s Phase 7 section and this file were restored to their pre-Phase-7 content. The database tables were dropped via a hand-written migration (`20260819091800_remove_delivery_logistics`, applied via `prisma migrate deploy` since `migrate dev` correctly refuses to run non-interactively for data-loss changes) after explicit confirmation, since they held one real record created through the browser (`DEL-2026-000004`) plus test data. The Order Details delivery-tracking work from earlier the same day (the entry directly above) was **kept** — only Phase 7 itself was requested to be removed. One side effect from post-revert verification testing: order `ORD-2026-000009`'s `deliveryStatus` was advanced from `NOT_DISPATCHED` to `DISPATCHED` by a test call and could not be reverted through the API (the forward-only rule correctly blocked it) — left as-is rather than bypassing that rule with a raw DB edit.
- 2026-08-19: manual/repeatable delivery-status selection built for `OrderDetail.tsx` (any of the 4 statuses, any direction, `IN_TRANSIT` repeatable with a new location each time) plus the equivalent manual selector for `orderStatus`; `deliveredDate` kept in sync in both directions. Same day, a **second, final Phase 7 spec was pasted** ("Delivery Tracking & Status Management" — explicitly keeping delivery on Order Details, not a separate module) and curated into `PHASE7_TODO.md`; completed 2026-08-19/20 — a separate "Add Location Update" action distinct from "Change Status", a "Received By" field (real `DeliveryTracking.receivedBy` column) for the Delivered step, and delivery-status changes re-gated from the generic `order:update` permission to the dedicated `delivery:update` permission. Manual date/time backdating was deliberately not built (keeps the audit trail trustworthy). See `PHASE7_TODO.md` for the full curated list and completion notes.
- 2026-08-19: **Phase 8 — Inventory & Stock Management** completed (see `PHASE8_TODO.md`). Stock stays a property of `Product` (no separate inventory module) — new `StockHistory` table recording every stock-affecting event (manual Add/Adjust plus the existing order create/edit/cancel stock movements, now all writing to the same history), `stock:add`/`stock:adjust` permissions, Add Stock/Adjust Stock dialogs and stock history on Product Details, 🟢/🟠/🔴 stock status on the Products list, and a Low Stock/Out of Stock widget on the Dashboard. Deliberately no "Reserved" stock state — the existing decrement-at-creation/restore-on-cancel model already prevents overselling.
- 2026-08-20: **Phase 9 — Dashboard & Reports** completed — see the "Phase 9" section below and `PHASE9_TODO.md` for full detail.
- 2026-08-20: **Notifications & Communication spec pasted and curated into `PHASE10_TODO.md`, then deliberately deferred** — the CRM doesn't need a notification system at this size yet. See the "Phase 10 — Notifications & Communication" section below.
- 2026-08-20: **Phase 11 — Advanced Customer & Order Management completed.** Curation surfaced one real bug (Customer Detail's purchase-summary stat cards compared against the wrong enum casing and always showed zero — fixed) and one direct conflict with an earlier decision (this spec asked for forward-only order-status validation again, which the "manual status" work had explicitly removed) — resolved by reintroducing forward-only validation for both `orderStatus` and `deliveryStatus` with a full Admin/Manager override, live-verified. See the "Phase 11" section below and `PHASE11_TODO.md`.
- 2026-08-20: **Responsive-layout audit and fix** across every page, prompted by "some pages going out of bound" — see "Responsive layout fix" below for full detail.
- 2026-08-20: **Suppliers & Purchase Management spec pasted and curated into `PHASE12_TODO.md`, deliberately deferred** — the incoming-stock counterpart to Phase 8 (Supplier → Purchase → Stock, with purchase price/history separate from selling price), not needed yet. See the "Phase 12" section below.
- 2026-08-20: **Two new optional Order fields — Article Number and Estimated Delivery Charges — added directly** (not curated-then-deferred; requested and built the same session). Reused the existing, previously-unwired `trackingNumber` column (renamed to `articleNumber`) instead of adding a duplicate field; added a new `estimatedDeliveryCharges` column that's verified to never enter the order total calculation. See "Article Number & Estimated Delivery Charges" below and the addendum in `PHASE7_TODO.md`.
- 2026-08-20: **Phase 13 — Invoice & Payment Management completed.** Replaced the existing bare, manually-set `Order.paymentStatus` dropdown with a real append-only `Payment` ledger and a status computed from `SUM(payments.amount)` — the old manual endpoint/UI was removed, not kept alongside the new one. Migration backfilled `invoiceNumber` for every existing order and a `Payment` row for the 2 orders that were already manually PAID, so real historical data wasn't reverted to Unpaid. See the "Phase 13" section below and `PHASE13_TODO.md`.
- 2026-08-20: **Add Payment dialog refined** (Phase 13 follow-up) — asks Full Paid vs. Partial first instead of a bare amount field; Full Paid auto-fills the exact remaining balance read-only. Frontend-only, posts to the already-verified payment endpoint. See the addendum in `PHASE13_TODO.md`.
- 2026-08-20: **Phase 14 — System Polish & Business Workflow Improvements spec pasted, curated, and its concrete gaps built the same session.** Explicitly a hardening pass, not a new module. Curation cross-checked the actual code rather than assuming, and found six real gaps, all now fixed: a live information-disclosure bug (raw internal error messages sent to the client on unhandled 500s, plus a related bug where the frontend never surfaced Zod's field-level validation detail), Global Search not covering Employees, missing confirmation dialogs on Deactivate actions, missing indexes on the `Order` columns every filter/dashboard/report query actually uses, and no shared `EmptyState`/`PageHeader` component (now added and adopted on the four main list pages). A trigram index for name/phone search and four broader audits (permission matrix, validation messages, HTTP status codes, filter Apply/Clear) were deliberately left as their own future pass rather than bundled in. See the "Phase 14" section below and `PHASE14_TODO.md`.
- 2026-08-20: **Dashboard's "+ Add Customer" / "+ Add Product" quick actions now open straight into the Add dialog** instead of just landing on the list page — `?add=1` query param, consumed once on mount then stripped from the URL. Small UX fix, requested directly.
- 2026-08-20: **Product SKU auto-generation + structured weight, added directly** (requested with a full recommended form; clarified four open design questions with the user before building — category-derived abbreviation, per-category sequence, optional weight, fixed Unit dropdown — then a live mid-build correction added the product name into the SKU too). See "Product SKU Auto-Generation & Structured Weight" below.
- 2026-08-21: **Phase 15 — New User Signup & Approval Workflow spec pasted (across two messages: signup/approval, then suspend/reactivate), curated, three open questions asked and answered, backend built.** Manager access became configurable (`authorize()` no longer bypasses for `MANAGER`), with every existing Manager backfilled with full permissions so nothing broke on ship; a real pre-existing gap was found and closed along the way (`productService.list()` had zero permission scoping, so global search would have leaked product data to a brand-new `PENDING` account). See the "Phase 15" section below and `PHASE15_TODO.md`.
- 2026-08-21: **Phase 15 addendum, requested before any frontend was built**: the permission model extended from Role+Permissions to Role+Permissions+**Data Scope** (All vs. Assigned, per module, admin-configurable per Manager/Employee — today this is hard-coded by role), plus permission presets (Standard Employee/Standard Manager/Full Access/Custom, frontend-only) and an explicit "Full Access ≠ Admin" principle (an Employee can get full business permissions without gaining any administrative authority). Checked against the requested module/action grid: only two new permission strings needed (`customer:delete`, `product:deactivate`) — everything else already existed. See "Phase 15" below and `PHASE15_TODO.md`'s addendum for the full build breakdown.
- 2026-08-21: **Phase 15 addendum frontend built and Phase 15 completed.** `/signup` page, pending-approval screen, the shared `PermissionPicker` (presets + per-module Data Scope + checkboxes), the Admin Approve/Reject panel, and Suspend Access/Reactivate buttons. A real bug caught along the way: `lib/auth.ts`'s `hasPermission()` still had the old "Manager bypasses everything" rule — would have kept every Manager's UI acting as full-access even after the backend made it real and enforced. Fixed. Full detail in `PHASE15_TODO.md`'s "Frontend: built" / "Verified" sections.
- 2026-08-21: **Security fixes, requested directly after a "how would a hacker attack this" review.** That review found a real, live issue: `backend/.env` had `JWT_SECRET=replace_me` — the exact placeholder `.env.example` ships — meaning the running server was signing session cookies with a publicly-known secret. Anyone who knew it could forge a valid Admin session with no password at all. Fixed: `config.ts` now requires `JWT_SECRET` (min 32 chars, explicitly rejects the literal `'replace_me'`) and fails to start rather than silently falling back, same as `DATABASE_URL` already did; a real random secret was generated and set in `.env`, which also had the side effect of invalidating every previously-issued session cookie. Also fixed: `/auth/signup` used to return `409 "already exists"` for a taken email — a straightforward account-enumeration oracle, and inconsistent with `forgotPassword`'s own already-established "never reveal whether an email is registered" rule right next to it. Now returns the identical response either way and silently no-ops instead of erroring when the email is taken (verified live: signing up with `admin@example.com` and with a genuinely new email produce byte-identical responses, and no duplicate/corrupted record was created for the existing account). Also added rate limiting to `/forgot-password` and `/reset-password`, which had none before (reusing the same `express-rate-limit` pattern already used for `/login`/`/signup`).
- 2026-08-21: **Trash / Recycle Bin spec pasted (across two messages: the core design, then a Permanent Delete follow-up), curated, one critical technical question asked and answered, fully built.** Curation checked every relevant foreign key's actual `ON DELETE` behavior in the applied migration SQL before writing anything, and found a real conflict: a literal `DELETE FROM` is only safe for `Product` — `Customer` is blocked outright by Postgres (`ON DELETE RESTRICT` from `Order`); `Order` is blocked the same way by its own line items, and cascading past that would mean deleting `Payment` rows, directly breaking the append-only ledger Phase 13 deliberately built; `Employee`/`User` deletion is technically FK-safe but would silently blank out "Created by: Amit Kumar"-style attribution. Resolved (asked, not assumed): real delete for Product, anonymize-in-place for the other three. A real bug was caught during live testing: a trashed Employee could still log in — `authService.login()` checked `status` but never `deletedAt` (the two are deliberately independent axes), fixed and reverified. See "Trash / Recycle Bin" below and `PHASE16_TODO.md`.
- 2026-08-21: **`backend/public/uploads/` scaffolded** (`products/` and `store/` subfolders — a future store logo alongside product images), served statically at `/public/*` (`express.static`, verified live). Deliberately scoped to a folder-and-serving scaffold only, per the user's own choice — no upload endpoint exists yet, so nothing writes here yet. `public/uploads/.gitignore` keeps actual uploaded files out of version control while preserving the folder structure (`.gitkeep`). Clarified before building: this is images only — nothing that could be sensitive (customer records, exports, invoices) belongs in any publicly-servable folder, consistent with the 2026-08-21 security review.
- Remaining: a human browser click-through of the newest UI work (Ctrl+K search including the new Employees group, inline-add-customer, Change Status dialog, inline edit rows, the Phase 9 dashboard/reports, the responsive fixes, Phase 13's payment UI, the new Deactivate confirmation dialogs, the new Add Product form, Phase 15's signup/approval/permission-picker UI, the new Trash page and Delete flows) — everything below the UI interaction layer is verified, see the relevant sections below.

### Responsive layout fix (2026-08-20)

No browser automation is available in this environment, so this was a code-review
audit (grep for known overflow patterns across every page/component, then reason
through each one), not a visual click-through — flagged explicitly, consistent with
how every other UI change in this project has been reported.

**Root cause, affecting every page**: `App.tsx`'s `AppShell` wraps the main content in
`<div className="flex-1">` inside a row-direction flex container alongside `<Sidebar
/>`. A flex item's default `min-width` is `auto`, not `0` — so *any* unbreakable-width
content anywhere on *any* page (a long order number, a wide row that doesn't wrap,
a fixed-width control) stops that column from shrinking and pushes the entire app
wider than the viewport, instead of the offending content wrapping or scrolling
within its own box. This is why the symptom was "*some* pages," not all — only pages
whose content happened to be wide enough to trigger it were visibly affected, but the
underlying bug was global. Fixed by adding `min-w-0` to that wrapper — a one-line,
high-leverage fix.

**Individual rows fixed on top of that** (defense in depth — these could still
overflow their own card even with the root cause fixed, since Dialogs portal outside
the app shell and some list rows crammed multiple pieces of dynamic-length content
onto one unwrapped line): `CustomerDetail.tsx`'s new Phase 11 `OrderHistoryCard` row
(the worst offender — order number, date, amount, status, and a Reorder button all on
one line with no wrap; restructured into a two-line layout), several `Home.tsx` list
rows (Recent Orders/Customers, Top Products, Low Stock), `Reports.tsx`'s Top
Customers/Best Selling rows, `ProductDetail.tsx`'s Stock History rows,
`CustomerPicker.tsx`, and `GlobalSearch.tsx`'s result rows — all gained `min-w-0
truncate` on the primary (potentially long) text and `shrink-0` on the secondary
value, so long names ellipsize instead of forcing overflow.

**Dialog forms**: `Products.tsx`'s Add/Edit Product dialogs (×4 occurrences),
`CustomerDetail.tsx`'s Edit Customer dialog, and `AddCustomerDialog.tsx` all had a bare
`grid grid-cols-2` for form fields with no mobile stacking — Tailwind's grid columns
use `minmax(0,1fr)` so this never actually overflowed, but was cramped on narrow
phones. Changed to `grid-cols-1 sm:grid-cols-2` so fields stack below ~640px.

**Two smaller spot fixes**: `Reports.tsx`'s tab row (4 tabs with no wrap/scroll) got
`overflow-x-auto`; `Employees.tsx`'s bulk-assign bar (a fixed `w-56` Select next to
text, no wrap) got `flex-wrap`.

Verified via `tsc --noEmit`, `eslint` (0 errors, same 5 pre-existing warnings), and
`vite build` — all clean. **Not verified visually in a real browser** at narrow
viewport widths, since no browser automation tool is available in this session; the
fixes address the specific mechanisms identified via code review, not a screenshot
comparison.

### CORS connectivity fix (2026-08-18)

Asked directly "is the backend connected to the frontend" — rather than assuming yes because every phase's curl smoke tests had passed, actually checked what a real browser would do. `backend/src/app.ts` had never had CORS middleware; the frontend (`http://localhost:5173`, Vite dev server) calls the backend (`http://localhost:4000`) as a different origin, using `credentials: 'include'` for the HttpOnly-cookie auth. A real preflight `OPTIONS` request confirmed the backend returned no `Access-Control-Allow-Origin`/`Access-Control-Allow-Credentials` headers at all — meaning **every single fetch from the frontend, since Phase 1, would have been blocked by the browser**, even though the API itself worked correctly (which is exactly why curl-based verification never caught it: curl doesn't enforce CORS, only browsers do).

Fixed:
- Installed `cors` + `@types/cors` in `backend/`.
- Added `CORS_ORIGIN` to the zod-validated env schema in `config.ts` (defaults to `http://localhost:5173`), and to `.env.example`.
- Wired `app.use(cors({ origin: config.corsOrigin, credentials: true }))` in `app.ts`, ahead of `express.json()`/`cookieParser()`. Uses an explicit origin (not `*`) because the browser rejects wildcard-origin CORS responses on credentialed requests.

Verified live (not just typechecked): restarted the backend, re-ran the exact preflight — now returns `Access-Control-Allow-Origin: http://localhost:5173` + `Access-Control-Allow-Credentials: true`; ran a full login → cookie → authenticated `GET /api/customers` round trip with an explicit `Origin: http://localhost:5173` header (replicating exactly what the browser sends) and confirmed it succeeds end-to-end. Also started both dev servers and confirmed the frontend serves and the backend health check responds. `tsc --noEmit` and `eslint` both clean on the change.

### Frontend route audit (2026-08-18)

Asked "is every frontend route connected to the API" — checked all 14 routes in `App.tsx` by cross-referencing every `apiFetch` call in every page against the actual backend route files (path, method, query-param enum values), not just re-reading prior claims. Result: every call site matches a real endpoint correctly — verified further with a live smoke test hitting all six core resources (`/customers`, `/products`, `/categories`, `/orders`, `/users`, `/auth/me`) with a real session, all `200`.

That audit also surfaced a different kind of gap: 3 backend endpoints that were fully built and working but had **no frontend caller at all** — the same pattern as the Phase 6 payment-status gap found earlier this session:

- **`PATCH /products/:id`** (edit product) — `Products.tsx` only had an "Add product" dialog, no edit. Spec requirement: "Edit Products" ✅ Admin/Manager (phases.md permission matrix).
- **`PATCH /users/:id`** (edit employee name/email) — `Employees.tsx` only had create + activate/deactivate + permissions, no edit. Spec requirement: "Edit users" (phases.md Phase 3 §10, Admin capabilities).
- **`PATCH /users/:id/role`** (change role) — no UI control existed anywhere to promote/demote an existing user. Spec requirement: "Change roles" (phases.md Phase 3 §10).

Fixed all three:
- Added `EditProductDialog` to `Products.tsx`, mirroring `Categories.tsx`'s existing edit-dialog pattern (same `productFormSchema` as the create dialog, prefilled, `PATCH /products/:id`). Extended the `ProductListItem` frontend type with `description`/`image` (already returned by the list endpoint, just not typed) so the dialog can prefill without an extra fetch.
- Added `EditEmployeeDialog` to `Employees.tsx` — name/email fields always shown (`PATCH /users/:id`), plus an Admin-only Role select (`PATCH /users/:id/role`) restricted to `MANAGER`/`EMPLOYEE` — same constraint `CreateEmployeeDialog` already applies, since promoting to `ADMIN` isn't a workflow this app exposes casually.

**Incidental backend bug found and fixed while verifying the product-edit dialog live:** `productService.update()` ran `assertCategoryIsActive(input.categoryId)` whenever `categoryId` was present in the request body at all — including when it was unchanged. Since the edit dialog always resubmits the full form, any product whose category had since been deactivated (a real, pre-existing state in the dev database from earlier Phase 5 testing) would fail to save with `"This category is deactivated and cannot be selected for products"`, even without touching the Category field. Fixed in `backend/src/services/product.service.ts`: the check now only runs when `categoryId` is actually changing (`input.categoryId !== existing.categoryId`), not just present. Verified live: saving a product with its already-inactive category untouched now succeeds (`200`); attempting to newly assign a different product to that same inactive category is still correctly rejected (`400`).

All three new mutations (`PATCH /products/:id`, `PATCH /users/:id`, `PATCH /users/:id/role`) were curl-tested end-to-end against the live database and reverted afterward. `tsc --noEmit`, `eslint` (0 errors, same 5 pre-existing warnings), and `vite build` all clean.

### Gap closure vs. the fuller Phase 1 / Phase 2 spec (2026-08-18)

On 2026-08-17 `phases.md` was updated with a more detailed Phase 1 and Phase 2 spec than this scaffold originally targeted, and a gap analysis found real gaps. All were closed on 2026-08-18:

**Phase 1 — closed:**

- Added shadcn/ui (hand-authored primitives following the real shadcn conventions — `components.json`, CSS-variable theme, `cn()` helper), TanStack Query, React Hook Form + `@hookform/resolvers`, Zod (frontend), Lucide icons, and Motion. All are installed at latest and typecheck; Motion is stack-ready but not yet used by any UI (no animated feature exists until Phase 7's delivery tracker).
- ESLint and Prettier are now actually installed and passing. Replaced the deprecated `.eslintrc.json` format with a flat `eslint.config.js` (required by ESLint 10) covering both `frontend/` (browser + React Hooks + Fast Refresh rules) and `backend/` (Node globals) with `eslint-config-prettier` to avoid rule conflicts. Fixing real lint errors along the way surfaced and fixed three `no-explicit-any` uses in `logger.ts`/`errorHandler.ts` (now `unknown`) and an unused-directive in `lib/prisma.ts`.
- Added `frontend/src/lib/api.ts` (fetch wrapper reading `VITE_API_BASE_URL`, typed `ApiError`) and wired `@tanstack/react-query`'s `QueryClientProvider` in `main.tsx`. `Home.tsx` now demonstrates the full path — calls the real `/api/health` endpoint through `useQuery`, showing a `Skeleton` while pending and `ErrorState` on failure.
- Added Forms (`components/ui/form.tsx`, `input.tsx`, `label.tsx` — react-hook-form context wrappers per shadcn convention; no live form yet since no CRUD screen exists until Phase 4), Loading skeletons (`components/ui/skeleton.tsx`), and Error states (`components/ErrorState.tsx`).
- Real mobile navigation: `Sidebar`'s link list was extracted into a shared `NavLinks` component, rendered both in the static desktop `<aside>` and inside a new Radix-based `Sheet` (slide-in drawer) wired to the `Navbar` hamburger button, which now actually opens/closes it.
- Removed the old hand-rolled placeholder components (`Button.tsx`, `Card.tsx`, `Dialog.tsx`, `Table.tsx`, `Toast.tsx`) — superseded by real shadcn-style equivalents under `components/ui/`, with `Toast` replaced by `sonner`'s `Toaster`.

**Phase 2 — closed:**

- Added `@@index` to every foreign-key column across `schema.prisma` (`CustomerPhone.customerId`, `CustomerAddress.customerId`, `Product.categoryId`, `Order.customerId`/`createdById`, `OrderItem.orderId`/`productId`, `DeliveryTracking.orderId`/`updatedById`, `CustomerNote.customerId`/`createdById`, `CustomerActivity.customerId`/`createdById`, `Notification.userId`, `AuditLog.userId`). Applied via `npx prisma migrate dev --name add_fk_indexes` against the live Neon database.
- Added the missing backend layers — `controllers/`, `services/`, `repositories/`, `schemas/`, `utils/` — and refactored the customers module into them as the reference pattern: `schemas/customer.schema.ts` (Zod, including a proper `customerIdParamSchema` replacing the old unchecked `Number(req.params.id)`), `repositories/customer.repository.ts` (Prisma access), `services/customer.service.ts` (throws a typed `NotFoundError` from new `utils/httpError.ts`), `controllers/customer.controller.ts`, and `utils/asyncHandler.ts` to remove per-route try/catch boilerplate. `errorHandler.ts` now also formats `ZodError`s as 400s. Verified end-to-end: `GET /api/customers` → `200 []`, `GET /api/customers/abc` → `400` validation error, `GET /api/customers/999999` → `404 Customer not found`.

### Fixes applied (2026-08-17)

- Removed deprecated `backend/src/index.js` (pre-TypeScript placeholder entry point, superseded by `index.ts`/`app.ts`, referenced by no script).
- Upgraded Prisma from an unpinned `"*"` to the latest ORM 7 (`7.9.1`), including the breaking generator/config changes:
  - `schema.prisma` generator switched from the deprecated `prisma-client-js` to `prisma-client`, with client output now at `backend/src/generated/prisma` (gitignored) instead of `node_modules/@prisma/client`.
  - `datasource.url` removed from `schema.prisma` (no longer supported in v7); connection URL now supplied via new `backend/prisma.config.ts` (CLI) and `@prisma/adapter-pg` (runtime, wired in `src/lib/prisma.ts` and `prisma/seed.ts`).
- Fixed `backend/prisma/schema.prisma` relation errors that blocked `prisma generate`/`validate` entirely: `CustomerNote`, `CustomerActivity`, and `Notification` were missing opposite relation fields on `Customer`/`User`.
- Fixed `backend/tsconfig.json`: added `include: ["src/**/*.ts"]` — previously `tsc` failed immediately because `prisma/seed.ts` fell outside `rootDir` with no include/exclude to scope it out.
- Added `@types/express` to `backend/package.json` (was missing entirely, not just uninstalled — broke every route file's types).
- Fixed the frontend, which could not install or build at all: added the missing `@vitejs/plugin-react` dependency (imported in `vite.config.ts` but never declared), and added `frontend/tsconfig.json` / `tsconfig.node.json` (didn't exist).
- Removed unused `import React from 'react'` in 7 frontend files — dead under the modern `react-jsx` automatic transform this tsconfig now uses.
- Ran `npx prisma migrate dev --name init` and `npm run seed` against the configured Neon database (with explicit user confirmation, since it's a live external database) — tables now exist and the admin user is seeded.

### New files added during fixes (2026-08-17)

These weren't part of the original Phase 1/2 scaffold — they were required to make the scaffold actually install, typecheck, and run:

- `backend/prisma.config.ts`
  - Purpose: Prisma ORM 7 CLI config (schema path, migrations dir, seed command). Supplies `DATABASE_URL` to Prisma CLI commands (`generate`, `migrate`) now that `datasource.url` can no longer live in `schema.prisma`.
  - Status: completed
- `backend/src/generated/prisma/`
  - Purpose: Generated Prisma Client output directory, produced by `npx prisma generate` using the new `prisma-client` generator. Replaces the old `node_modules/@prisma/client` import location — application code now imports the client from here (see `src/lib/prisma.ts`, `prisma/seed.ts`).
  - Status: generated, not hand-written — gitignored (`.gitignore`), regenerate any time via `npx prisma generate`.
- `frontend/tsconfig.json`
  - Purpose: TypeScript config for the frontend app (`src/`) — target/lib, `jsx: react-jsx`, `moduleResolution: bundler`, strict mode. Did not exist before; the frontend had no TypeScript project config at all.
  - Status: completed
- `frontend/tsconfig.node.json`
  - Purpose: Separate TypeScript config scoped to `vite.config.ts` (Node-context file, referenced from `tsconfig.json`), per the standard Vite React+TS template split.
  - Status: completed

### New dependencies added (fixes, 2026-08-17)

- `backend/package.json`: `@prisma/adapter-pg` (driver adapter, required at runtime by Prisma 7), `@types/express` (was missing entirely — broke typechecking on every route file). `prisma` / `@prisma/client` pinned from unpinned `"*"` to `^7.9.1` (latest).
- `frontend/package.json`: `@vitejs/plugin-react` (imported by `vite.config.ts` but never declared — frontend could not install or build without it).

### New files added closing the Phase 1/2 gaps (2026-08-18)

- `eslint.config.js` (root) — flat ESLint config; replaces removed `.eslintrc.json`.
- `frontend/components.json` — shadcn/ui CLI config (style, Tailwind paths, `@/` aliases) so `npx shadcn add` works going forward.
- `frontend/src/lib/utils.ts` — `cn()` class-merging helper (clsx + tailwind-merge), used by every `components/ui/*` primitive.
- `frontend/src/lib/api.ts` — typed fetch wrapper reading `VITE_API_BASE_URL`.
- `frontend/src/lib/queryClient.ts` — shared TanStack Query `QueryClient` instance.
- `frontend/src/vite-env.d.ts` — typed `import.meta.env` (didn't exist; `VITE_API_BASE_URL` was untyped).
- `frontend/src/components/ui/` — `button.tsx`, `card.tsx`, `dialog.tsx`, `sheet.tsx`, `table.tsx`, `skeleton.tsx`, `label.tsx`, `input.tsx`, `form.tsx`, `sonner.tsx`.
- `frontend/src/components/ErrorState.tsx` — app-level error state (not a shadcn primitive).
- `backend/src/controllers/customer.controller.ts`, `backend/src/services/customer.service.ts`, `backend/src/repositories/customer.repository.ts`, `backend/src/schemas/customer.schema.ts`, `backend/src/utils/asyncHandler.ts`, `backend/src/utils/httpError.ts`.

### New dependencies added closing the Phase 1/2 gaps (2026-08-18)

- `frontend/package.json`: `@tanstack/react-query`, `react-hook-form`, `@hookform/resolvers`, `zod`, `lucide-react`, `motion`, `class-variance-authority`, `clsx`, `tailwind-merge`, `@radix-ui/react-dialog`, `@radix-ui/react-slot`, `@radix-ui/react-label`, `sonner` (deps); `tailwindcss-animate` (devDep).
- Root `package.json`: `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `eslint-config-prettier`, `globals`, `prettier`, plus a `"type": "module"` field (needed for `eslint.config.js` to load without a warning) and `lint`/`format`/`format:check` scripts.

---

## Phase 3 — Authentication, Authorization, Roles & Permission Management (completed, 2026-08-18)

Full spec in `phases.md`; build order was tracked in `PHASE3_TODO.md` during implementation. Implemented and verified end-to-end (curl smoke test of the full hierarchy + frontend build/typecheck/lint) — see that file's final state for the complete checklist.

**Schema (`backend/prisma/schema.prisma`, migration `20260818045635_auth_roles_permissions`):**

- `User` extended: `role` converted from free-text to a `Role` enum (`ADMIN`/`MANAGER`/`EMPLOYEE`), `password` renamed to `passwordHash`, added `status` (`AccountStatus` enum: `ACTIVE`/`INACTIVE`/`SUSPENDED`), `managerId` self-relation (Manager → Employees hierarchy), `lastLoginAt`.
- New `UserPermission` model (per-Employee granular permission grants, `@@unique([userId, permission])`).
- New `PasswordResetToken` model (hashed, short-lived, single-use).
- `Customer` extended with `assignedEmployeeId`/`assignedManagerId` (both indexed) for the assignment system.
- Migration was hand-written rather than generated by `prisma migrate dev`, because that command refuses to run non-interactively when it detects a data-loss-risking change (renaming `password` on a non-empty table) — see the migration file for the manual SQL (`RenameColumn`, enum conversion preserving existing values, new tables/columns/indexes/FKs). Applied via `prisma migrate deploy`.

**Backend — full layered stack added:**

- `schemas/`: `auth.schema.ts`, `user.schema.ts`, `permission.schema.ts` (the `PERMISSIONS` list + `DEFAULT_EMPLOYEE_PERMISSIONS`), `customerAssignment.schema.ts`.
- `repositories/`: `user.repository.ts`, `permission.repository.ts`, `passwordReset.repository.ts`; `customer.repository.ts` extended with `assign`/`bulkAssign`/`recordActivity`/`findAssignmentById`.
- `services/`: `auth.service.ts` (bcrypt, JWT issuance, forgot/reset/change password — reset tokens are logged for dev, never emailed or returned via the API, since no email provider is wired up yet), `user.service.ts` (Manager/Employee creation with role-based rules + `assertManagesUser` ownership check reused by permissions), `permission.service.ts`; `customer.service.ts` extended so `list()` is scoped per role (Admin: all, Manager: team, Employee: own — phases.md §20-21) and gained `assign`/`reassign`/`bulkAssign`.
- `middleware/`: `authenticate.ts` (HttpOnly cookie → JWT verify → loads user + permissions onto `req.user`), `authorize.ts` (permission-gated, Admin/Manager bypass) plus `requireRole()` (role-gated, for endpoints outside the Employee permission list like user management and assignment), `checkAccess.ts` (`checkCustomerAccess` — assignment-scoped), `rateLimiter.ts` (5 attempts/15min on login).
- `controllers/` + `routes/api/`: `auth.ts` (login, logout, me, forgot/reset/change-password), `users.ts` (list/create/update/status/role/permissions, Admin+Manager only, role-change is Admin-only). `customers.ts` now protected end-to-end and gained `/bulk-assign`, `/:id/assign`, `/:id/reassign`.
- `utils/jwt.ts` (sign/verify + `authCookieOptions()` — `httpOnly`, `secure` in production, `sameSite: lax`), `types/express.d.ts` (`req.user` augmentation).
- `prisma/seed.ts` now bcrypt-hashes the admin password instead of storing it in plaintext (closing the warning flagged since Phase 2).

**Frontend:**

- `pages/Login.tsx` (react-hook-form + zod, password-visibility toggle, `motion` entrance animation — first real use of the `motion` dependency installed in Phase 1), `pages/ForgotPassword.tsx`, `pages/ResetPassword.tsx`.
- `lib/auth.ts` — `useCurrentUser()`, `useLogin()`, `useLogout()`, `hasPermission()`. `lib/api.ts`'s `apiFetch` now sends `credentials: 'include'` (cookie-based auth, not localStorage — deliberately, per phases.md §5) and handles `204` responses.
- `components/RequireAuth.tsx` / `RequireRole.tsx` — route guards; `App.tsx` restructured into nested routes with a new `AppShell` layout route, so `/login` etc. render standalone without Sidebar/Navbar.
- `Sidebar`'s nav list is now role-aware (Employees link only for Admin/Manager); `Navbar` shows the current user + a working logout button.
- `pages/Employees.tsx` — list (Managers + their Employees), create-employee dialog (Admin picks role + Manager; a Manager can only create Employees under themselves), status activate/deactivate, a permissions dialog matching the phases.md §14 checkbox layout, and a customer-assignment table with per-row reassign and multi-select bulk-assign.
- New `components/ui/checkbox.tsx` and `select.tsx` primitives (needed for the permissions/assignment UI) plus a `--popover` theme token that was missing from the Phase 1 Tailwind setup.

**New dependencies:**

- `backend/package.json`: `bcrypt`, `jsonwebtoken`, `cookie-parser`, `express-rate-limit` (+ matching `@types/*`).
- `frontend/package.json`: `@radix-ui/react-checkbox`, `@radix-ui/react-select`.

**Known simplifications, deliberate for this phase:**

- Password reset emails aren't actually sent (no email provider configured) — the service logs the reset token for local dev instead. Wiring a real provider is a separate, later concern.
- Three test accounts (`manager1@example.com` / Manager, `rahul@example.com` and `amit@example.com` / Employees under that Manager, all password `password1`) were created during manual verification and left in the database as convenient demo data for continuing Phase 4 work — not part of the official seed script.

### Follow-up fixes from a checklist audit (2026-08-18)

Checking the implementation against `phases.md`'s Phase 3 checklist item-by-item (not just trusting the earlier summary) turned up two real gaps, both fixed:

- **Change password had no frontend UI.** The backend endpoint (`POST /api/auth/change-password`) worked and was verified by curl, but nothing in the frontend called it. Added `frontend/src/pages/ChangePassword.tsx` (current/new/confirm password form) at `/change-password`, reachable via a new key icon in `Navbar`.
- **The `/reassign` endpoint was dead code from the UI's perspective.** `Employees.tsx`'s per-row assignment dropdown always called `POST /customers/:id/assign`, even for a customer that already had an owner — so the dedicated reassign endpoint, and its distinct `"Reassigned to X"` activity-log wording, were never actually exercised. Fixed: the dropdown now calls `/assign` for an unassigned customer and `/reassign` once one already has an owner. Verified via curl that both endpoints fire correctly and `CustomerActivity` records the two actions with different wording.

`phases.md`'s Phase 3 checklist is now fully checked off, verified against the real code rather than assumed.

---

## Phase 4 & 5 — Customer Management, Products + Categories (completed, 2026-08-18)

Full spec in `phases.md`; build tracked in `PHASE4_5_TODO.md`. Both phases deliberately kept order logic and inventory-ledger logic out — customer/product catalogs only, per the guardrail in `phases.md`.

**Schema (`backend/prisma/schema.prisma`, migrations `customer_product_foundations` + `category_description`):**

- `Customer` gained `status` (new `CustomerStatus` enum: `ACTIVE`/`INACTIVE`), `email`, `createdById` (→ `User`).
- `CustomerAddress` gained `country` (default `"India"`).
- `Product` gained `unit`, `minimumStock`, `createdById` (→ `User`).
- `ProductCategory` gained `active` (default `true`) and `description` (the latter was missing from the schema entirely despite being in the original spec — caught while wiring the category service, added in a follow-up migration).
- New `ProductActivity` model, mirroring `CustomerActivity`.

**Backend — full layered stack for both modules:**

- Customers: `schemas/customer.schema.ts` (create/update/status/list-query, with a Zod refine enforcing exactly-one-primary-phone), `schemas/customerNote.schema.ts`; `repositories/customer.repository.ts` extended with `create` (customer+phones+address in one write), `update` (transactional phone/address replace), `updateStatus`, and `findMany` rewritten to take an arbitrary `Prisma.CustomerWhereInput` + pagination/sort — `repositories/customerNote.repository.ts` new; `services/customer.service.ts` builds the list `where` clause with a hardening rule (only Admin can filter by arbitrary `assignedEmployeeId`/`assignedManagerId` — a Manager/Employee can't widen their own role-scoped view via query params), diffs old vs. new values to write human-readable `CustomerActivity` entries (`"Name updated"`, `"Phone numbers updated"`, etc.) — `services/customerNote.service.ts` new; routes extended with `POST /`, `PATCH /:id`, `PATCH /:id/status`, `GET`/`POST /:id/notes`, `GET /:id/activity`, all with `authorize`/`checkCustomerAccess` per the Phase 3 pattern.
- Products/Categories (entirely new modules): `schemas/product.schema.ts`, `schemas/category.schema.ts` (with a `slugify` helper); `repositories/product.repository.ts`, `repositories/category.repository.ts` (category list includes a live product `_count`); `services/product.service.ts` (SKU-uniqueness check, rejects assigning a product to an inactive category, low-stock is computed in-memory since `availableQty < minimumStock` compares two columns and isn't a single Prisma filter), `services/category.service.ts` (auto-slugifies from name, enforces the "existing products keep their deactivated category, but it can't be selected for new ones" rule from `phases.md` §7); `routes/api/products.ts` + `routes/api/categories.ts`, both mounted in `routes/api/index.ts`.

**Frontend:**

- `pages/Customers.tsx` (search + status filter + pagination + add dialog with a phone `useFieldArray` and a Primary toggle), `pages/CustomerDetail.tsx` (Overview stat cards, Contact, Address, Orders — empty until Phase 6, Purchases computed from `orders` rather than stored, Assignment display, Notes panel, Activity feed, an Edit dialog reusing the phone-array pattern).
- `pages/Products.tsx` (search + category/status/stock filters + low-stock icon indicator + pagination + add dialog), `pages/ProductDetail.tsx` (image with a placeholder icon, price+unit, stock status, activity feed, activate/deactivate), `pages/Categories.tsx` (list with product count, add, activate/deactivate).
- New `components/ui/textarea.tsx` primitive (needed for notes/descriptions, didn't exist before).
- Hit one real TypeScript/react-hook-form friction point: a Zod schema using `z.coerce.number()` (for price/stock fields) can't be paired with `useForm<z.infer<typeof schema>>()` — the input type before coercion is `unknown`, which conflicts with the output type the generic expects. Fixed with the documented pattern `useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>()` in `Products.tsx`.

**Verified for real:** curl smoke tests for both modules — customer creation with 2 phones (and confirmed the exactly-one-primary validation actually rejects 2 primaries), search/filter/pagination, update with per-field activity logging, deactivate/reactivate, notes with author attribution, full activity trail; category+product creation with both uniqueness constraints enforced (409s), low-stock filter correctly isolating the one under-threshold product, price/stock-change activity logging, and — the important business rule from `phases.md` §7 — deactivating a category blocks it for _new_ products (400) while leaving its _existing_ products fully editable. Also caught and fixed a real gap while wiring the frontend: the customer list/detail repository queries didn't include the `assignedEmployee`/`assignedManager` relations at all, so the UI had no way to display "Assigned To" — added.

A demo customer (Rajesh Kumar, 2 phones, one address), a Manager-created demo customer (Scope Test Customer, used to verify the scoping fix below), and a demo category+2 products (one deliberately low-stock) were created during verification and left in the database as convenient content to look at — not part of the official seed script.

### Follow-up fixes from a checklist audit (2026-08-18)

Same exercise as Phase 3's audit — went through every key point in `phases.md` Phase 4 §1-13 and Phase 5 §1-13 against the actual code rather than trusting the summary above. Found and fixed real gaps:

- **No "Unassign customer"** — spec-listed explicitly (§4: "Manager should be able to: Assign / Reassign / Unassign / Bulk assign"), but no endpoint or UI existed. Added `POST /api/customers/:id/unassign` + a button in `Employees.tsx`.
- **Assignment/activity history didn't show who did it** — `findActivity` never included the `createdBy` relation for either `CustomerActivity` or `ProductActivity`, so the feed showed "Assigned to Rahul" but not "by Suresh" as the spec's own example requires. Fixed both repositories and both detail pages.
- **A genuine access-scoping bug, found while testing the unassign fix**: unassigning a customer previously cleared both `assignedEmployeeId` _and_ `assignedManagerId`. Since Manager visibility requires `assignedManagerId === self`, a Manager who unassigns a customer immediately lost the ability to even see it — the customer effectively vanished into an Admin-only state. Separately, a customer created by a Manager had no `assignedManagerId` set at all, making it invisible to its own creator until separately assigned to an Employee. Both fixed: `unassign` now only clears `assignedEmployeeId` (the customer stays in the Manager's team view, shown as "Unassigned" — matching the §1 mockup's own "Assigned To: Unassigned" row), and `create` now auto-scopes to the creating Manager. Verified via curl: created a customer as Manager and confirmed immediate visibility; assigned → unassigned a customer and confirmed the Manager could still view its activity log afterward.
- **No Sort control in the UI** for Customers or Products (backend already supported `sortBy`/`sortDir`) — added dropdowns to both (Customers: Newest/Oldest/Name A-Z/Z-A; Products: those plus Price and Stock ascending/descending).
- **No filter UI for Assigned Employee, City, District, State** on the customer list, despite backend support — added (assigned-employee filter shown only to Admin, since the backend already ignores it for Manager/Employee).
- **No "Created date" filter** — wasn't even in the backend query schema. Added `createdFrom`/`createdTo` to `customerListQuerySchema`, the service's where-builder, and two date inputs on the frontend.
- **Categories had no Edit UI** — backend `PATCH /categories/:id` existed and worked, frontend only had Add + activate/deactivate. Added an Edit dialog.
- **Categories had no Search** — explicitly spec-listed ("Features: Add, Edit, Deactivate, Search"), missing entirely on both ends. Added `search` support to the schema/repository/service/controller and a search input to `Categories.tsx`.
- Deliberately left alone: multiple product images. The spec itself marks this optional ("main image, with optional additional images"); the single `image` URL field covers the common case without building out a media-management UI this phase doesn't otherwise need.

All fixes re-verified: `tsc --noEmit` clean on both packages, `eslint` clean, `vite build` clean, and every new/changed endpoint curl-tested — including the scoping-bug fix specifically (Manager creates a customer → sees it immediately; assigns then unassigns → still has access afterward).

---

## Phase 6 — Order Management (completed, 2026-08-18)

Full spec in `phases.md`; build tracked in `PHASE6_TODO.md`. Before writing any code, a Phase 4/5/6 connection audit found and resolved 7 gaps up front (documented in `phases.md` §44) — relation naming, access-control derivation, active-status validation, the `INACTIVE` customer rule, the `shipping` field name, the address-snapshot assumption, and a `createdById` naming consistency fix. Two more ambiguities were resolved during implementation itself (both documented in code comments and below).

**Schema (`backend/prisma/schema.prisma`, migrations `order_management` + none needed for `order:cancel`):**

- New enums: `OrderStatus`, `PaymentStatus`, `DeliveryStatus` (basic 4-state), `PaymentMethod`.
- `Order`: `orderStatus`/`paymentStatus`/`deliveryStatus` converted from `String` to the new enums (0 existing rows, so no hand-written migration SQL was needed this time); added `paymentMethod`, `assignedEmployeeId`, `cancelledById`, `cancelledAt`, `cancellationReason`. All three `User` relations explicitly named (`"OrderCreatedBy"`/`"OrderAssignedEmployee"`/`"OrderCancelledBy"`), including renaming the previously-unnamed `createdBy` relation (`User.orders` → `User.createdOrders`).
- `OrderItem` gained a `unit` snapshot field.
- New `OrderAddress` (delivery-address snapshot, `orderId @unique`), `OrderActivity` (with `oldValue`/`newValue`, per the spec's own literal structure — different shape from `CustomerActivity`/`ProductActivity`'s free-text `activity` string), `OrderNote` models.
- Added `order:cancel` to the Phase 3 permission list (not to `DEFAULT_EMPLOYEE_PERMISSIONS` — Employees get view+create only, matching the spec's own example).
- `lib/prisma.ts` gained a `PrismaClientOrTx` type — the first place in this codebase where a single business operation (order creation) needs multiple repositories to participate in one transaction, so repository methods that need it now accept an optional transaction client instead of always using the singleton.

**Backend:**

- `repositories/order.repository.ts`, `repositories/orderNote.repository.ts` — new. `product.repository.ts` gained `decrementStock`/`incrementStock` using an atomic `updateMany` with `availableQty: { gte: quantity }` in the `where` clause (not read-then-write), so two concurrent orders can't both pass a stale stock check and oversell.
- `services/order.service.ts` — the substantial one. `resolveOrderItems()` is the single function that enforces "never trust the frontend price": it only ever reads `{ productId, quantity }` and looks up price/name/SKU/unit/stock from the live `Product` row. `create()`/`update()`/`cancel()` all run inside `prisma.$transaction`.
- **Two more ambiguities resolved during implementation** (beyond the 7 found in the pre-build audit):
  - phases.md §15/§17's cancel/edit cutoff tables mix Order Status and Delivery Status values as if one sequence, despite §11/§12 stating they're independent fields. Resolved: both gates check `deliveryStatus === NOT_DISPATCHED` (plus blocking the `COMPLETED`/`CANCELLED` terminal `orderStatus` values) — that's the field that actually answers "has fulfillment started."
  - §16 literally says stock is deducted "on order confirmed," implying a separate confirm step, but the Create Order screen (§2) is a single `[Create Order]` action with no such step, and §7's stock-check example is framed as happening at creation. Resolved: stock is validated and deducted at **creation** time; `orderStatus` from `PENDING` onward is a pure workflow field with no further stock side effects.
- `middleware/checkAccess.ts` gained `checkOrderAccess`, scoped by the order's **customer's live assignment** — verified live: assigning a customer to an Employee mid-session immediately gave that Employee access to the customer's existing orders, without needing `Order.assignedEmployeeId` (which stayed a display-only snapshot) to change at all.
- `routes/api/orders.ts` — all endpoints from §29, plus `PATCH /:id/status` (not in §29's list, but the `PENDING`→`CONFIRMED`→`PROCESSING`→`COMPLETED` lifecycle needs _some_ way to advance, and every other module here already uses this exact convention for Customer/Product/Category).

**Frontend:**

- `pages/Orders.tsx` — search/filter/sort/pagination, status badges, separate desktop table and mobile card layouts (phases.md §40).
- `pages/CreateOrder.tsx` — customer and product search-and-select, line-item builder with a live _estimated_ total (explicitly labeled as such — the real total comes from the create response), stock warnings, payment method, notes.
- `pages/OrderDetail.tsx` — delivery timeline stepper, pricing breakdown, activity feed, notes panel, Cancel dialog (reason required, pre-dispatch only), Reorder button, order/delivery status advance buttons.
- **Known scope cuts, not blockers**: no address-override UI in `CreateOrder` (silently defaults to the customer's address, matching the backend default); no line-item editing UI on `OrderDetail` (the backend's `PATCH /:id` supports it, but building that UI would essentially duplicate `CreateOrder`'s item builder — left for a follow-up); the employee/date-range/amount filters that exist on the backend query schema weren't added to the `Orders.tsx` filter bar (same scope call made for Customers' city/district/state filters in Phase 4).

**Verified for real, not assumed:** curl-tested the full lifecycle live — order creation with a **forged price field that was silently ignored** (the actual security-critical property, not just code-reviewed), insufficient-stock rejection with the transaction confirmed rolled back (stock literally unchanged afterward), cancellation restoring stock, reorder using current prices with correct sequential order numbers, dispatch blocking both edit and cancel, and role-scoped access — assigning a customer to an Employee mid-test and confirming that Employee immediately gained access to the customer's orders while an unrelated Employee got `403` on direct access and an empty list otherwise.

---

## Cross-Cutting UX Upgrade — Inline Customer Creation & Global Search (completed, 2026-08-19)

Requested as a global application requirement, not a Phase 6 addition — full spec-level
writeup in `phases.md`'s "Cross-Cutting Requirement" section, working checklist in
`PHASE1-6_TODO.md`.

**Prerequisite bug found and fixed first:** verified live that an Employee who creates a
customer got `403` trying to view or order for that customer immediately afterward —
`assignedEmployeeId`/`assignedManagerId` were both left `null` on Employee-created
customers. This is the same class of bug already fixed for Managers earlier in the
project, just never extended to Employees, and it would have made the new
inline-creation feature broken for its primary users on day one. Fixed in
`customer.service.ts`: Employees now auto-get `assignedEmployeeId = self` and
`assignedManagerId = self.managerId` on creation, mirroring the Manager branch.

**Backend:**

- `customer.repository.ts` — `create()`/`recordActivity()` now accept an optional
  transaction client, so customer creation can participate in another module's
  transaction.
- `order.schema.ts`/`order.service.ts` — `POST /orders` now accepts `newCustomer` as a
  mutually-exclusive alternative to `customerId`; when present, the customer and the
  order are created in one `prisma.$transaction` (customer + phones + address +
  activity, then stock-checked order items + order + activity) — a mid-transaction
  failure (e.g. insufficient stock) leaves **no** orphaned customer, confirmed live by
  searching for it after a forced `400`.
- **Found and fixed live**: that heavier transaction exceeded Prisma's default 5000ms
  interactive-transaction timeout against the real Neon database — an actual timeout
  error, not a hypothetical. Raised to 15s on all three order transactions
  (create/update/cancel) for headroom against Neon's network latency.
- New `GET /api/search?q=` (`search.service.ts`/`.controller.ts`/`routes/api/search.ts`)
  — global search aggregator. Deliberately calls the exact same permission-scoped
  `list()` each module's own page already uses (never a raw unscoped query), so results
  can't leak records outside what the acting user could otherwise see. `q` requires 2+
  characters.

**Frontend:**

- `lib/useDebouncedValue.ts` — applied to every page-level search input (`Customers`,
  `Products`, `Orders`, `Categories`, plus `CreateOrder`'s product search) — typing no
  longer fires a request per keystroke.
- `components/CustomerPicker.tsx` + `components/AddCustomerDialog.tsx` — generic,
  reusable customer search-or-create UI (not order-specific), wired into
  `CreateOrder.tsx` in place of its old inline search block. Creating a customer inline
  auto-selects it — no return trip to the Customers page. The "+ Add New Customer"
  trigger is gated by `hasPermission(user, 'customer:create')`. Includes a duplicate-phone
  soft-check (debounced lookup while typing the phone, "Customer may already exist" with
  Use Existing / Create Anyway) — not a hard DB constraint, since a unique-phone rule
  would break legitimate shared-phone households.
- `components/GlobalSearch.tsx` — command-palette-style dialog wired to `Ctrl+K`/`Cmd+K`
  (listener in `App.tsx`'s `AppShell`) and a search bar in `Navbar.tsx`. Debounced,
  grouped results (Customers/Orders/Products), full keyboard nav, "View all N results"
  links. Ran into a real lint error from the React Compiler's stricter rules
  (`setState` called synchronously inside a `useEffect`) on the open/reset logic —
  fixed by adjusting state during render instead, React's recommended pattern for this
  case, not just a style fix.

**Verified:** `tsc --noEmit` clean on both packages, `eslint` 0 errors (6 pre-existing-pattern
warnings, one more than before purely because `AddCustomerDialog` reuses the same
`form.watch()` phone-array pattern `Customers.tsx` already had), `vite build` clean. Live
curl-tested: the Employee-assignment prerequisite fix, the atomic `newCustomer`-on-order
path (success, rollback-on-failure, mutual-exclusivity validation, permission gate),
the duplicate-phone lookup query, and the global search endpoint (success, too-short
query rejected, unauthenticated rejected). **Not yet done:** an actual human
click-through in a browser (Ctrl+K open/close, arrow-key navigation, the full Create
Order inline-add-customer flow) — everything below the UI interaction layer is verified,
but no browser automation was available to click through the UI itself.

---

## Order Details Redesign & Delivery Tracking History (completed, 2026-08-19)

Requested as "keep the original app structure, rebuild the Order Details page" plus a
proper delivery tracking history instead of a single `deliveryStatus` field. Working
checklist: `ORDER_DETAILS_UPGRADE_TODO.md`.

**No schema migration needed for the tracking history** — `DeliveryTracking`
(`orderId`/`status`/`location`/`note`/`updatedById`/`createdAt`) has existed since
Phase 2, fully migrated and relation-wired on both sides, just never used by any
repository/service/controller until now. Building the layers on top of it was the
actual task, not designing a new table.

**Backend:**

- `GET /orders/number/:orderNumber` — new order-number-based lookup
  (`orderService.getByOrderNumber`), reimplementing `checkOrderAccess`'s exact scoping
  rule inline rather than teaching the numeric-id middleware a second identifier type.
  Had to register it **before** `GET /:id` in the router — Express's numeric `:id`
  param would otherwise swallow "number" as a literal id value and the route would
  never be reached. Caught before it shipped by testing the actual route, not just
  reading the code.
- `updateDeliveryStatus()` now runs as a transaction: updates `Order.deliveryStatus`
  (+ `deliveredDate` on reaching `DELIVERED`) and inserts a `DeliveryTracking` row in
  the same call, accepting optional `location`/`note`. New `GET /orders/:id/tracking`
  returns the full history, ascending.
- Added forward-only sequence enforcement (`NOT_DISPATCHED → DISPATCHED → IN_TRANSIT →
  DELIVERED`, no skips, no backward moves) — this had never been validated before
  (confirmed by reading the prior code: any status was accepted from any other), added
  now because a real "Change Status" picker needed a real guard, not just a UI that
  happened to only offer "next."
- `PATCH /orders/:id` gained `assignedEmployeeId` (validated against a real Employee)
  and `expectedDelivery`. Refined the dispatch-gate to apply only to the *core* edit
  (items/discount/deliveryCharge/address) — reassigning who's responsible for an order
  or correcting its expected delivery date stays available after dispatch, since both
  are realistically more useful once an order is already moving, not less. Verified
  live on an already-**DELIVERED** order: both succeeded; a genuine core edit (items)
  on that same order was still correctly rejected — proves the split works, not just
  that everything got more permissive.
- "Received by" (from the Delivered-status form) folds into the note text rather than
  a new column, and no custom timestamp entry is offered (every tracking row uses the
  server's `now()`) — both deliberate v1-scope decisions to avoid growing the schema
  and to keep the audit trail trustworthy (no backdating).

**Frontend:**

- Order URLs are now `/orders/:orderNumber` (e.g. `/orders/ORD-2026-000007`) instead of
  the numeric id — `OrderDetail.tsx` resolves the order once via the new lookup
  endpoint, then every sub-resource call (notes/activity/tracking/status updates) uses
  the resolved numeric id, same as before. All navigation call sites updated
  (`Orders.tsx`'s list links, `CreateOrder.tsx`'s and `OrderDetail.tsx`'s own
  post-create/post-reorder redirects).
- Full page reorganized into the requested structure: header → order status strip →
  Customer + Order Summary (two-column) → Order Items (now showing the per-item
  discount column) → Delivery → Order Notes → Activity.
- New `DeliveryCard`: current status + current location (derived from the latest
  tracking entry, not a separately stored field) + last updated/by, a "Change Status"
  dialog whose fields depend on the target stage (matches the backend's forward-only
  rule, so there's no dropdown to accidentally pick a skip from), and a real timeline
  rendering every tracking entry's location/note/updated-by/timestamp plus one
  greyed-out pending marker for what's next.
- Inline view→edit→save affordances for Assigned Employee (gated to Admin/Manager,
  since `/users` itself is Admin/Manager-only on the backend — an Employee couldn't
  populate the picker even if shown, so the UI is gated to match) and Expected Delivery
  Date.
- Customer phone/address editing deliberately stays on the existing Customer Detail
  page ("View Full Customer Profile →" link) rather than duplicating that page's edit
  forms inline — matches the request's own stated principle of dedicated pages for full
  management. Order item/quantity inline editing remains a known, explicitly-deferred
  scope cut (same as Phase 6) — a real item editor would duplicate `CreateOrder.tsx`'s
  product builder; this pass's effort went to delivery tracking, the request's
  centerpiece.

**Verified:** `tsc --noEmit` clean on both packages, `eslint` 0 errors (6 warnings, same
pre-existing pattern, no new ones), `vite build` clean. Live curl-tested the full
delivery sequence end to end (skip-to-Delivered correctly rejected; then walked
Dispatched → In Transit → Delivered with locations and notes, confirmed all 3 history
rows with correct data, confirmed `deliveredDate` auto-set), the order-number lookup
(found/404/numeric-route-unaffected), and the assigned-employee/expected-delivery
updates with their dispatch-gate exemption. **Not yet done:** an actual human
click-through in a browser (opening the Change Status dialog, the inline edit rows,
verifying the timeline renders as expected) — no browser automation was available.

---

## Phase 7 — Delivery Tracking & Status Management (completed, 2026-08-19)

Two-part build in one day: first a "manual status selection" request (remove all
transition restrictions the earlier delivery-tracking work had imposed), then a
second, final pasted spec ("Final Phase 7 — Delivery Tracking & Status Management")
explicitly keeping delivery on Order Details rather than a separate module — curated
into `PHASE7_TODO.md` before any of that second part was built.

**Part 1 — manual/repeatable status selection (no schema change):**

- `Order.orderStatus`: the old "Mark {next}" button was replaced with a manual
  `Select` offering all 4 non-cancelled statuses directly
  (`PENDING`/`CONFIRMED`/`PROCESSING`/`COMPLETED`), selectable in any order.
- `Order.deliveryStatus`: removed the forward-only `DELIVERY_SEQUENCE` transition
  guard from `order.service.ts` entirely (the now-dead constant was deleted, not left
  unused). `ChangeDeliveryStatusDialog` was reworked from "next status only" to a full
  picker of all 4 states — `IN_TRANSIT` can be re-selected multiple times to log
  movement through different locations while still in transit, and a status can be
  reverted backward.
- `deliveredDate` kept in sync bidirectionally: set on (re-)marking `DELIVERED`,
  cleared if reverted away from it, so it never shows a stale delivery timestamp.

**Part 2 — final spec, curated into `PHASE7_TODO.md`:**

The pasted spec's core stance — no separate Delivery module, everything lives on
Order Details — was already how the app was built by Part 1; that wasn't new work.
Genuinely new items, all shipped:

1. **"Add Location Update"** — a new, lighter action next to "Change Status" on the
   Delivery card, shown only while `deliveryStatus === 'IN_TRANSIT'`. Opens a dialog
   with just Location + Note (no status picker) and posts to the same
   `PATCH /orders/:id/delivery-status` endpoint with `deliveryStatus` held at
   `IN_TRANSIT` — no schema change, a frontend-only UX split from "Change Status."
2. **"Received By"** — a real `receivedBy` column added to `DeliveryTracking`
   (migration `20260819124807_add_delivery_received_by`), captured on the Delivered
   step via a dedicated input, and rendered on the delivery timeline entry.
3. **Permission gating fixed** — `PATCH /orders/:id/delivery-status` and the
   frontend's Change Status/Add Location Update controls were gated on the generic
   `order:update`; switched to the dedicated `delivery:update` permission (already
   defined in `PERMISSIONS`, previously unused by anything), so a Manager can grant
   delivery-status rights to an Employee independently of general order-editing
   rights.
4. Manual date/time entry for backdating a status update was evaluated and
   deliberately **not** built, to keep the audit trail trustworthy (no backdating).

**Verified:** `tsc --noEmit`/`eslint` clean on both packages after both parts (0
errors, same pre-existing warnings). Live curl-tested the full delivery flow end to
end: Dispatch → In Transit (location 1) → Add Location Update (location 2, same
status, no status-label change) → Delivered with Received By — confirmed every
tracking row including the new `receivedBy` field — then reset the test order back to
`NOT_DISPATCHED` afterward.

---

## Phase 8 — Inventory & Stock Management (completed, 2026-08-19)

Full spec pasted by the user; curated into `PHASE8_TODO.md` before any code was
written. Inventory deliberately stays a property of `Product`, not a separate module,
per the spec's own "keep it simple" framing — the same shape of decision as Phase 7
keeping delivery on Order Details.

**Schema (migration `add_stock_history`):**

- New `StockHistory` model (`productId`, `change` (±Int), `reason`, `note?`,
  `orderId?`, `createdById?`, `createdAt`) — one row per stock-affecting event,
  whether manual (Add/Adjust Stock) or order-driven (order create/edit/cancel).
- `Product.availableQty`/`minimumStock`/`unit` already existed from earlier phases —
  no change needed there.

**Backend:**

- `POST /products/:id/stock/add`, `POST /products/:id/stock/adjust` (the adjust route
  is guarded via an atomic `updateMany` so stock can never go below 0),
  `GET /products/:id/stock-history`.
- `stock:add`/`stock:adjust` added to `PERMISSIONS` — gated with `authorize(...)`
  (ADMIN/MANAGER bypass, Employee needs an explicit grant) rather than the
  `requireRole('ADMIN','MANAGER')` the rest of the Products routes use, specifically
  so a Manager can grant stock rights to an Employee without handing them full
  product-edit rights. Not added to `DEFAULT_EMPLOYEE_PERMISSIONS`.
- The three existing order-driven stock touch points (create, item-edit, cancel in
  `order.service.ts`) now each also write a matching `StockHistory` row (`Order
  Placed`/`Order Items Updated`/`Order Cancelled`), so manual and order-driven stock
  changes show up in the same history instead of two disconnected records.
- Product search extended to also match category name (previously name + SKU only).
- Deliberately kept the existing "decrement stock at order creation, restore on
  cancel/edit" model rather than adding a separate `reservedQty`/Reserved state — it
  already prevents overselling (the same guarantee a Reserved state exists to
  provide), without a second stock-transition path tied to delivery status.

**Frontend:**

- Products list: quantity plus a separate 🟢/🟠/🔴 Stock Status column (previously
  just a plain text label).
- Product Details: a Stock card (Current Stock/Minimum Stock/Status) with
  `AddStockDialog`/`AdjustStockDialog` (each gated on `stock:add`/`stock:adjust`) and
  a Stock History list (delta, reason — or `Order #...` when order-linked — note,
  date, who made the change).
- Add/Edit Product's Unit field changed from free text to a `Select` from the spec's
  fixed 7-option list (Piece/Packet/Box/Bag/Kg/Litre/Bottle).
- Home/Dashboard gained a real Low Stock / Out of Stock alert widget (later
  superseded/extended by Phase 9's fuller dashboard rewrite, which reuses the same
  `stock=low|out` product query).
- Employees permission UI: "Add Stock"/"Adjust Stock" rows added under the Products
  permission group.

**Verified:** `tsc --noEmit`/`eslint`/`vite build` clean on both packages. Live-tested
add stock, adjust stock (including the below-zero guard correctly rejecting an
over-large negative adjustment), stock history (including order-linked rows),
low/out-of-stock filters, and category-name search against the real database; test
data (stock levels) reset back to original afterward.

---

## Phase 9 — Dashboard & Reports (completed, 2026-08-20)

Full spec pasted by the user; curated into `PHASE9_TODO.md` before any code was
written — curated because the pasted spec included a "Pending Follow-ups" widget on
the Employee dashboard, and no follow-up/task entity exists anywhere in this app.
Building one would have been inventing a new domain feature to fill a dashboard slot,
not surfacing existing data, so it was deliberately omitted (documented in
`PHASE9_TODO.md`).

**Backend:**

- `GET /api/dashboard/summary` — one consolidated, role-scoped endpoint (Admin/Manager
  get the full business view; Employee is automatically limited to their own assigned
  customers/orders, reusing the same scoping pattern the Orders/Customers list
  endpoints already use). Matches the pasted spec's own explicit performance
  recommendation (§21: don't fetch everything and aggregate in React — have the
  backend return summarized data).
- Four new `GET /api/reports/{sales,orders,customers,products}` endpoints, Admin/Manager
  only (`requireRole`, not a new permission — matches the spec's own role-based access
  table for Reports). Each accepts a `range`
  (today/yesterday/week/this-week/this-month/lastMonth/custom) plus report-specific
  filters (Orders Report additionally takes status/employee/customer).
- New `backend/src/lib/orderMetrics.ts` — a single shared `salesEligibleFilter`
  (excludes `CANCELLED`) used everywhere revenue or "units sold" is aggregated: sales
  totals, the Sales Report, the Customer Report's top spenders, and Top
  Products/Best Selling. Counts that are just "how many orders exist" (Total Orders,
  the Orders Report's `byStatus`, Recent Orders) deliberately do **not** filter — a
  cancelled order still exists, it just didn't sell anything.
  **How "Sales" is defined in this app: the sum of `Order.total` for every
  non-cancelled order in the date range.** There's no separate payment/invoice ledger,
  so `Order.total` — already the source of truth everywhere else in the app — is what
  "Sales" means here too.
- Calendar-based date ranges (week starts Monday, month starts the 1st) are shared
  between the dashboard's compact numbers and the Sales Report's date filter, so the
  two always agree on what "this week"/"this month" means.
- "Today's Overview"'s Dispatched/In Transit/Delivered numbers are today's *new*
  status changes specifically (distinct orders with a `DeliveryTracking` row created
  today for that status) — not the running totals shown further down in Orders/Delivery
  Overview. Counts distinct orders, not raw tracking rows, since `IN_TRANSIT` can
  legitimately be logged more than once per order in a single day.

**Two real bugs found and fixed while building this:**

1. **Phase 8 regression**: `productService.list`'s `stock=low` filter applied
   pagination *before* the in-memory low/minimum-stock comparison, so its `total`
   silently under-counted as soon as there were more products than one page — exactly
   the number the new dashboard's Low Stock card needed to be correct. Fixed via a new
   `productRepository.findAllMatching` (fetches all matching rows unpaginated); the
   service now filters first, then paginates the *filtered* set. Verified live: with 2
   qualifying low-stock products and `pageSize=1`, `total` now correctly reports `2`
   (previously would have reported `1`).
2. **Found while centralizing the sales/sold definition above**: Top Products/Best
   Selling was counting order items from *cancelled* orders as sold. Verified live:
   quantity sold for one product dropped from 15 to 10 once cancelled-order items were
   correctly excluded from the count.

**Frontend:**

- `Home.tsx` rewritten as a role-aware dashboard. Admin/Manager: greeting header, 4
  summary cards (Customers/Orders/Sales/Pending), a "Today" empty-state-aware block,
  Sales Summary, clickable Orders/Delivery status breakdowns (click a status → the
  Orders page pre-filtered to it), Low Stock/Out of Stock (linking to the Products page
  pre-filtered), Recent Orders/Customers, Top Products, and permission-gated Quick
  Actions. Employee: a smaller "My Dashboard" (My Customers/My Orders/Orders In
  Transit/Delivered/Recent Customers), or a friendly "nothing assigned yet" message.
- New `Reports.tsx` (`/reports`, Admin/Manager only, new Sidebar entry) — Sales/Orders/
  Customers/Products sections switched by a hand-rolled tab control (no Radix Tabs
  dependency added just for this), each with its own date-range/filter controls and a
  client-side "Export CSV" button (`lib/exportCsv.ts` — serializes whatever's already
  on screen; no backend export endpoint, no Excel/PDF).
- `components/Sparkline.tsx` — a small hand-rolled inline SVG line chart for the Sales
  Report's daily trend. No charting library added for one sparkline.
- `Orders.tsx` and `Products.tsx` now read their status/stock filters from the URL
  query string on load (`useSearchParams`), so a dashboard or report link like
  `/orders?deliveryStatus=IN_TRANSIT` or `/products?stock=low` lands pre-filtered
  instead of on a bare list page — applied consistently everywhere a dashboard number
  reasonably links somewhere.
- Empty states: a dedicated "No orders yet" banner replaces the entire
  Today/Sales/Orders/Delivery block when a scope has zero orders (instead of a wall of
  ₹0 cards); the same idea covers an Employee with nothing assigned yet. Recent
  Orders/Customers/Top Products messages now explain what will appear and when, not
  just "No X yet."
- "Last updated: HH:MM [↻]" in the dashboard header, backed by React Query's own
  `dataUpdatedAt`/`refetch` — no polling infrastructure or WebSockets added.

**Scope deliberately trimmed from the pasted spec** (reasoning recorded in
`PHASE9_TODO.md`): no follow-up/task entity; Reports gated by role rather than a new
permission; CSV export only, generated client-side (no Excel/PDF, no new
dependencies); no charting library, no advanced analytics/forecasting/profit/CLV
metrics; Orders Report has Date/Status/Employee filters but not Customer (a customer
picker felt disproportionate for one report filter). Per-widget partial-failure
isolation was considered and deliberately not built: the dashboard summary is one
consolidated call by design (the spec's own §21 recommendation), so there's no
"Summary ✅, Recent Orders ❌" scenario to isolate — splitting it into per-widget calls
just to enable that would undo the "one round trip" decision for no real benefit at
this app's scale. The Reports page's four tabs, by contrast, already are independent
calls with independent loading/error states.

**Verified for real, not assumed:** `tsc --noEmit` clean on both packages, `eslint` 0
errors (same 5 pre-existing warnings, no new ones), `vite build` clean. Live-tested
every new endpoint against the real database: `/dashboard/summary`, all four
`/reports/*` endpoints, the low-stock count fix, and the cancelled-orders-excluded
sold-count fix. **Employee API authorization verified directly against the backend,
not just via UI hiding**: created a throwaway Employee account, confirmed
`GET /dashboard/summary` succeeds (correctly scoped to that Employee) and all four
`GET /reports/*` endpoints return `403` — the test account was deactivated afterward.
**Not yet done:** an actual human click-through in a browser (the dashboard's clickable
cards, the Reports tabs, CSV export, the refresh button) — everything below the UI
interaction layer is verified, but no browser automation was available.

---

## Phase 10 — Notifications & Communication (deferred, 2026-08-20)

A full spec ("Phase 10 — Notifications & Communication": a `Notification` model,
🔔 bell icon + dropdown + `/notifications` page, role/assignment-scoped notification
types for order/customer/stock/employee events, click-through to the relevant page,
polling instead of WebSockets, Call/WhatsApp device links next to phone numbers, and
notification preferences) was pasted and curated into `PHASE10_TODO.md`, capturing
every design decision — but **no code was written**. Explicit call: this CRM doesn't
need a notification system yet, and building one now would be complexity without a
corresponding need.

`PHASE10_TODO.md` records the full curated scope for whenever this is picked up,
including two things worth remembering when it is:

- **Email notifications have a real prerequisite this app doesn't have yet**: no
  email provider is configured anywhere (Phase 3's password reset already just logs
  its token instead of emailing it — see that phase's "Known simplifications"). Real
  email in this phase means wiring up an actual provider first, not just app code.
- **Call/WhatsApp device links** (`tel:`/`https://wa.me/` next to phone numbers on
  Customer Detail / Order Detail) need none of the rest of this phase's
  infrastructure — no `Notification` table, no polling — so that one piece could be
  pulled forward and built standalone later if ever wanted, independent of the rest.

The phase actually built instead was **Phase 11 — Advanced Customer & Order
Management** — strengthening the existing Customer → Order → Product → Stock →
Delivery → Reports workflow rather than adding a new module. See the "Phase 11"
section below and `PHASE11_TODO.md`.

---

## Phase 11 — Advanced Customer & Order Management (completed, 2026-08-20)

Full spec pasted by the user; curated into `PHASE11_TODO.md` before any code was
written, following the Phase 10 deferral. Checked against the current codebase first —
several of the spec's items turned out to already be built, and curation surfaced one
real bug and one direct conflict with an already-shipped decision, both resolved (with
the user's explicit input on the conflict) before implementing the rest.

**Already built, no new work needed:** order cancellation with a required reason and
automatic stock restore; customer notes and order notes (kept as two separate panels);
assigned-employee display/edit on Order Details; duplicate-customer detection
(`AddCustomerDialog`'s phone-lookup soft-check); inline customer creation and
product-search suggestions during order creation (Cross-Cutting UX Upgrade); delivery
fully inside Order Details with no separate module (Phase 7); the stock-reservation
story (already covered by the existing decrement-at-creation model, Phase 8).

**Real bug found and fixed**: `CustomerDetail.tsx`'s Total Purchases / Pending /
Delivered stat cards compared `o.deliveryStatus === 'Delivered'` against the real
`DELIVERED` (upper snake case) enum — never matched, so those cards were wrong on
every customer. Fixed as part of rebuilding that section into a real order-history
list; Total Purchases now also excludes cancelled orders, matching `orderMetrics.ts`'s
Phase 9 sales definition.

**Conflict resolved, with an explicit decision from the user**: this spec's §8 asked
for backend-enforced forward-only order-status transitions again — directly reversing
the earlier "manual status" work that removed all transition restrictions on request.
Asked which way to go; chosen resolution: **forward-only validation reintroduced for
both `orderStatus` and `deliveryStatus`, with a full override for ADMIN/MANAGER**
(`assertNotBackward` in `order.service.ts`). "Forward" means the target stage's index
is `>=` the current stage's — not strictly adjacent-only, and explicitly not blocking
staying at the same stage, so Phase 7's most-valued behavior (re-logging `IN_TRANSIT`
multiple times with a new location) still works for every role. Only genuine backward
moves are blocked for non-Admin/Manager. Frontend pickers filter their options to
match, so an Employee doesn't see choices the backend would reject.

**New work built** (full detail in `PHASE11_TODO.md`):

- A real `OrderHistoryCard` on Customer Detail — dates now shown, a Reorder button per
  row, a "View All Orders (N) →" link to `/orders?customerId=X` (Orders.tsx now reads
  `customerId` from the URL with a "Filtered to customer: X · Clear" chip).
- `[+ Create Order]` on Customer Detail → `/orders/new?customerId=X`; `CreateOrder.tsx`
  fetches and preselects that customer once on mount.
- **Duplicate Order** on Order Details — distinct from Reorder (which creates
  immediately): navigates to `/orders/new` with router state carrying the source
  order's customer + item quantities; `CreateOrder.tsx` re-fetches each product live
  (current price/stock, never the source order's snapshot, matching Reorder's own
  rule) into a still-fully-editable form with a "review before creating" banner.
- Inline `[Change Employee]` on Customer Detail (new `AssignedEmployeeRow`, mirroring
  the one already on Order Details) — calls `/assign` or `/reassign` as appropriate,
  instead of just pointing users to the Employees page.
- Customer search now also matches city/district/pincode via the address relation.
- **Print Order** — a `[Print]` button + a `.print-only` block (Pashuseva header,
  order #, customer, items, total, delivery status); `tailwind.css` gained a
  `@media print` rule hiding `.print-hide` (Sidebar, Navbar) and showing `.print-only`.
- **Order line-item editing**, the item open since Phase 6/9 — new
  `EditOrderItemsDialog` on Order Details (add/remove products, change quantities),
  using `PATCH /orders/:id`'s existing server-side price/stock re-resolution, gated by
  the same pre-dispatch rule as Cancel Order. Customer-profile fields stay on Customer
  Detail as before — not duplicated into Order Details.

**Permission-granularity questions raised again by this spec** (§20's
`order:assign`/`customer:assign`, and a `delivery:update_status`/`delivery:add_location`
split) were **not** built — kept assignment role-gated (Admin/Manager) and
`delivery:update` as one permission, reaffirming the same call already made once for
delivery in `PHASE7_TODO.md`. Open to revisiting if a concrete need shows up.

**Verified for real:** `tsc --noEmit`/`eslint` clean on both packages (0 errors, same
5 pre-existing warnings), `vite build` clean. Live-tested against the real database:
forward-only status validation on both fields (Employee blocked backward, allowed
forward/same-stage; Admin override confirmed on both), customer search by city, the
order-history data shape, the product/customer fetch shapes the two prefill flows
depend on, and the assign/reassign endpoints. A throwaway employee account, a
temporary customer assignment, and an order's status were all reset back afterward.

---

## Article Number & Estimated Delivery Charges (completed, 2026-08-20)

Two optional `Order` fields, requested directly against "Phase 7/Order Management"
rather than curated as a new phase — implemented and verified the same session. Full
detail in `PHASE7_TODO.md`'s addendum; summary here:

- **Article Number** ("the tracking/reference number provided by the delivery
  company") reuses the `Order.trackingNumber` column that had existed since the
  original Phase 6 schema but was never wired up anywhere — confirmed via a full
  codebase grep (zero references in any repository/service/controller/frontend file)
  and the live database (0 of 10 existing orders had it set) before reusing rather
  than adding a duplicate field. Renamed to `articleNumber`; the sibling `courier`
  column stays unused, out of scope here. Labeled **"Article Number (Tracking No.)"**
  everywhere it's shown, per explicit follow-up request, so the two names stay
  visibly linked for anyone who remembers it as "tracking number."
- **Estimated Delivery Charges** is a new nullable `Float` column — matching every
  other money field on `Order` (`subtotal`/`discount`/`shipping`/`total`), a
  deliberate divergence from the pasted spec's suggestion to use `Decimal`: mixing
  numeric types across otherwise-identical sibling money fields would mean different
  serialization/type handling for one field with no practical benefit at this app's
  scale. **Verified live that it never enters the order total** — `total = subtotal -
  discount + shipping` is untouched; a real test order with
  `estimatedDeliveryCharges: 180` had `total` land exactly at `subtotal + shipping`.
- Both optional at creation (`CreateOrder.tsx`'s new "Delivery Information" section)
  and editable afterward (an inline editor on `OrderDetail.tsx`'s Delivery card, same
  interaction pattern as the existing Expected Delivery Date editor).
- **Real edge case caught and fixed**: clearing Estimated Delivery Charges by emptying
  the input must save `null`, not `0` — converting the input to a JS `Number()`
  client-side before sending would have silently turned "cleared" into "₹0" (since
  `Number('') === 0`). Fixed by sending the raw string and letting the backend's zod
  schema do the empty-string-to-`null` normalization. A `PATCH` that omits either
  field entirely leaves the stored value untouched (Prisma ignores `undefined`);
  explicitly sending an empty value clears it to `null` — verified both directions
  live, plus that editing an unrelated field (discount) doesn't disturb either.
- Article Number appears on the printable order view (`PrintableOrder`); Estimated
  Delivery Charges deliberately does **not** — that view is customer-facing and the
  charge is explicitly internal-reference-only, so showing it there risked a customer
  misreading it as billed on top of the total.
- Both changes are recorded in the order Activity log (`"Article number changed"` /
  `"Estimated delivery charges changed"`, old → new), matching every other tracked
  field.

Migration `20260820072943_order_article_number_and_delivery_charges` (a drop-and-add,
not a detected rename, since Prisma can't infer a rename from a Prisma-field-name
change alone — safe here since the old column had zero data). `tsc --noEmit`/`eslint`
clean on both packages, `vite build` clean; live-tested create/edit/clear for both
fields plus activity logging against the real database, test order cancelled
afterward.

---

## Product SKU Auto-Generation & Structured Weight (completed, 2026-08-20)

Requested with a full recommended Add Product form (Basic Information / Pricing &
Quantity / Media sections) and an auto-generated-but-editable SKU
(`PASH-CAL-1KG-001`-style). Four open design questions were clarified with the user
before building — reworded here since the answers shaped the implementation:

1. **Where does the abbreviation segment come from?** → Category name (deterministic,
   matched the existing informal SKUs already in the data like `PS-MD-003`). **Revised
   mid-build**: the user asked for both product *and* category, so the final format is
   `PASH-{CATEGORY_ABBR}-{PRODUCT_ABBR}-{WEIGHT?}-{SEQ}` — e.g.
   `PASH-SUP-CAL-1KG-001` for "Cow Calcium Supplement" in "Supplements", 1kg.
2. **Sequence scope** → per category (`PASH-FEE-…-001`, `PASH-FEE-…-002`, …), matching
   the existing informal pattern.
3. **Is Weight required?** → No — optional; the SKU simply omits that segment when a
   product has no meaningful net weight.
4. **Unit field (Piece/Packet/Box/Bag/Bottle)** → fixed dropdown, not free text.

**How the abbreviations are derived** (both computed fresh on every suggestion, not
stored):
- **Category abbreviation**: first 3 letters of the category's (already-unique) `slug`
  — e.g. "Feed" → `FEE`, "Pashuseva" → `PAS`. Collision-checked against every other
  category's abbreviation at the same length; only extends past 3 letters for the
  categories that actually collide.
- **Product abbreviation**: first word of the product name, letters only, uppercased,
  truncated to 3 — e.g. "Calcium and Mineral" → `CAL`. Deterministic rather than
  trying to extract a "meaningful" keyword from anywhere in the name; collisions
  between products (two different "Cow ..." products both → `COW`) are expected and
  harmless since the category segment + sequence number still keep every SKU unique.
- **It's a suggestion, not a reservation** — `GET /products/suggest-sku` (Admin/
  Manager only, same gate as product creation) computes a preview; the real
  uniqueness check still happens in `create()` as normal. A rare race between two
  admins previewing the same combo at once just surfaces as the existing "SKU already
  exists" 409, same as any manually typed duplicate today.
- Frontend calls it live as Name/Category/Weight change in the Add Product dialog
  (debounced), auto-filling the SKU field — but **stops overwriting it the moment the
  admin types into the SKU field directly** ("Custom SKU" hint replaces "Auto-generated
  — edit if needed"), so the suggestion is always a starting point, never a lock.
  Deliberately **not** wired into Edit Product — editing an existing product's
  category/weight must never silently rewrite its already-assigned SKU.

**Structured weight**: `Product` gained `weightValue Float?` + `weightUnit` (new
`WeightUnit` enum: G/KG/ML/L) — separate from `unit` (packaging type), which changed
from free text to a new `PackagingUnit` enum (PIECE/PACKET/BOX/BAG/BOTTLE). Both
weight fields are always set together (enforced via a zod `superRefine` on both create
and update) since a value with no unit, or vice versa, is meaningless. Migration
`20260820150000_product_weight_and_packaging_unit` — hand-written (same
non-interactive `migrate dev` limitation as every other migration this project),
converts the 3 existing free-text `unit` values ('Packet'/'Bag'/null, verified before
writing the migration) to the new enum losslessly.

**Frontend**: `productUnits.ts` (packaging/weight unit option lists + display-label
helpers, falling back to the raw value for old free-text data) is now used everywhere
a product's unit is shown — Products list/detail, Home's low-stock card, Reports' best
sellers, and Order line items (`OrderItem.unit` is an independent snapshot column, not
the enum, but new order items copy the enum value through at creation time so the same
label helper keeps them readable). The Add/Edit Product dialogs are restructured into
the requested Basic Information / Pricing & Quantity / Media sections via a small
local `FormSection` component.

**Verified**: backend `tsc`/`eslint` clean; frontend `tsc`/`eslint`/`vite build` clean
(one new pre-existing-pattern `react-hooks/incompatible-library` warning from
`form.watch`, matching 5 identical warnings already elsewhere in the app). Live-tested
against the real database: the exact "Cow Calcium Supplement" / Supplements-equivalent
category / 1kg example from the request produces the expected
`PASH-{CAT}-COW-1KG-{SEQ}` shape; no-category falls back to `PASH-GEN-…`; a
`weightValue` sent without `weightUnit` is correctly rejected with a clear field-level
message (courtesy of Phase 14's error-handler fix); duplicate SKU still 409s; clearing
weight via `PATCH` correctly nulls both fields together. Throwaway test product
deactivated afterward. One real product was created live by the user during this build
(`PASH-CAL-1KG-002`, manually adjusting the auto-suggested abbreviation) — kept as real
data, not cleaned up.

---

## Phase 12 — Suppliers & Purchase Management (deferred, 2026-08-20)

A full spec (Supplier → Purchase → Stock: a `/suppliers` list/detail page reusing the
Customer address/phone pattern; a Purchase creation flow — supplier, date, products
with a separate purchase price per line, notes; Draft/Received/Cancelled status where
stock only increases on the Draft→Received transition, tied to that specific
operation rather than "purchase exists," with careful reversal on cancellation after
receipt; a Purchase History section on Product Details distinct from Phase 8's Stock
History; new `supplier:*`/`purchase:*` permissions) was pasted and curated into
`PHASE12_TODO.md` — but **no code was written**. Explicit call: not needed yet.

This is the natural incoming-stock counterpart to Phase 8's outgoing/manual side, so
`PHASE12_TODO.md` records exactly how it would hook into existing code when it's
picked up: `StockHistory` (Phase 8) would gain a `purchaseId` nullable FK mirroring
the `orderId` field it already has for order-driven changes; the existing manual "Add
Stock" action stays (it's for restocking without a formal purchase, not replaced by
this); selling price (`Product.price`) and a new per-line purchase price never
conflict since they'd live on different tables; the Purchase creation form would reuse
`CreateOrder.tsx`'s existing product-search-and-line-item-builder pattern rather than
inventing a new one.

Explicitly excluded per the spec's own instruction, for whenever this is built: no
Accounts Payable, supplier credit, amount-owed/paid tracking, or payment schedules —
get Supplier → Purchase → Stock solid first; payments would be their own focused
future phase if actually needed.

---

## Phase 13 — Invoice & Payment Management (completed, 2026-08-20)

Full spec pasted by the user, framed as the recommended next phase — both Phase 10
(Notifications) and Phase 12 (Suppliers & Purchases) stay deferred, and nothing in
Phase 13 depended on either. Curated into `PHASE13_TODO.md` and a matching section in
`phases.md` first, built on a separate explicit "start building phase 13" instruction.

**The real shift, not just new UI**: `Order.paymentStatus` was previously just a bare
manual dropdown (`PATCH /orders/:id/payment`, a Phase 6 gap-fix, not a
deliberately-defended design) with no amount tracking behind it. Replaced with a real
append-only `Payment` ledger — status is now always computed from
`SUM(payments.amount)` vs. the order total, never settable directly. The old manual
endpoint, schema, repository method, and frontend dropdown were all **removed**, not
kept running alongside the new system.

**Migration handled existing data deliberately, not carelessly**: hand-written
(Prisma refused non-interactively, same as every prior data-affecting migration here)
to backfill an `invoiceNumber` for all pre-existing orders *and* a `Payment` row for
the 2 orders that were already manually marked PAID — so switching to computed status
didn't silently revert real historical "Paid" orders back to "Unpaid."

**Reused a lot of what already existed**, per `PHASE13_TODO.md`: the `Payment`
ledger's shape mirrors `StockHistory`/`DeliveryTracking` (append-only, linked to
Order, corrections via a new reversal row referencing the original rather than
editing history); invoice-number generation mirrors
`orderRepository.nextOrderNumber`; Print Invoice extends the `.print-only`
infrastructure and `PrintableOrder` component built for Print Order (Phase 11) rather
than creating new print plumbing; the Payments Reports tab reuses `Reports.tsx`'s
existing tab pattern and `lib/exportCsv.ts`; Customer Detail's purchase-summary cards
(Phase 11) and the Dashboard's consolidated summary endpoint (Phase 9) both just
gained fields rather than new sections/endpoints. The "Estimated Delivery Charges
never enters a total" rule (built just before this phase) extends directly to the
invoice total and the outstanding-amount calculation.

**New pieces**: a `Payment` model (with a `reversesPaymentId` self-relation for
corrections), `Order.invoiceNumber`, backend-enforced payment validation (re-sums the
ledger *inside* the transaction before checking the remaining balance, not from a
value read before it started — same race-safety principle as the stock guard), a new
`CARD` payment method, computed payment status, and new
`payment:view`/`payment:create`/`payment:edit` permissions (not granted to Employees
by default). UI landed on Order Details (a new `PaymentCard` with Payment History,
Add Payment, per-row Reverse, and the Invoice/Print Invoice section), Customer
Details, the Dashboard, and a new Reports tab.

Explicitly out of scope, per the spec's own repeated instruction: no payment gateway
integration, no complex accounting system, no free-editing of historical payments, no
separate financial dashboard. "Outstanding" used throughout, never "Debt"/"Due."

**Verified for real:** `tsc --noEmit`/`eslint` clean on both packages (0 errors),
`vite build` clean. Live-tested end to end against the real database: partial payment
→ overpayment correctly rejected with the exact remaining balance in the error →
paying the exact remainder flips status to Paid; reversal restores the balance and
correctly blocks both double-reversal and reversing a reversal; Dashboard
Outstanding/Today's Payments and the Payments report's totals matched hand-computed
expected values; the full three-way permission split enforced end-to-end with a
throwaway Employee account (no permission → 403 on view and add; view+create granted
→ add succeeds, reverse still 403 without edit). All test payments were reversed and
test accounts/assignments cleaned up afterward.

---

## Phase 14 — System Polish & Business Workflow Improvements (real gaps done, 2026-08-20)

Full spec pasted by the user — explicitly a hardening/polish phase, not a new
business module. Curated into `PHASE14_TODO.md` and a matching section in
`phases.md` before any code was written. Given the phase's own breadth (22
subsections touching nearly everything already built), curation meant actually
checking the code for each major claim rather than assuming — this surfaced real,
verified gaps alongside a lot that prior phases had already covered.

**Already covered by prior phases, no new work**: Global Search (Ctrl+K, debounced,
keyboard nav — covers Customers/Orders/Products already); loading skeletons across
every page; a dedicated responsive-layout audit-and-fix pass already done (the
`min-w-0` root-cause fix plus individual row/dialog fixes); Order Details' structure
already matches the spec's own outline; the backend's authenticate → authorize →
checkAccess → validate → service discipline already applied everywhere since Phase
3; Zod validation and toast feedback already used consistently.

**Real gaps found while checking, not assumed**:

All six of these are now **done**, in priority order:

- **DONE — the highest-priority item in this whole phase.** `errorHandler.ts`
  rewritten: Zod failures now surface the first field/message (e.g.
  `"name: Required"`) instead of the old flat `"Validation failed"` string — this
  also fixed a second bug found while investigating it, that `frontend/src/lib/api.ts`
  never read the `issues` array, so that generic string was literally the only
  validation feedback any user had ever seen. Added a `Prisma.
  PrismaClientKnownRequestError` branch (P2002 → 409, P2025 → 404). The unhandled-
  exception fallback now always returns a fixed generic message at 500 —
  `err.message` never reaches the client, only `logger.error(...)` as before.
- **DONE — Global Search now covers Employees.** New `userService.
  searchForGlobalSearch`, Admin/Manager-only (returns `[]` outright for an Employee
  acting user, matching `routes/api/users.ts`'s own gate — not just filtered, hidden
  entirely). New "Employees" result group in `GlobalSearch.tsx`.
- **DONE — Deactivate (Customer, Product) now has a confirmation dialog**, via a new
  shared `ConfirmDialog` component — same idea as `CancelOrderDialog`, generalized
  since deactivation doesn't need a reason field. (Employees.tsx has the same
  un-confirmed Deactivate shape but was left alone — outside this phase's named
  scope; `ConfirmDialog` is ready if that's picked up later.)
- **DONE — added shared `EmptyState` and `PageHeader` components**, styled to match
  `ErrorState.tsx`. Adopted on the four main list pages (Customers, Products, Orders,
  Employees); not swept across every page in the app.
- **DONE — added the missing `Order` indexes** (`orderStatus`, `deliveryStatus`,
  `paymentStatus`, `orderDate`) via a hand-written migration, applied cleanly with no
  data change.
- **Correctly left undone** — a trigram (`pg_trgm` + GIN) index for name/phone
  `contains` search, flagged as a different mechanism than the four indexes above;
  not urgent at this app's current data size.

**Needs a systematic pass, deliberately deferred** (scoped in `PHASE14_TODO.md`, not
done in this build — each is a broad audit spanning every module, not a single fix):
a full Admin/Manager/Employee × every-module permission matrix (prior phases each
verified only their own new endpoints); a schema-by-schema validation message audit;
an HTTP status code consistency spot-check; filter Apply/Clear coverage across every
list page and Reports tab.

**Explicitly not doing**: article number format validation (courier tracking-number
formats vary too much across providers to usefully constrain); any new business
module; confirmation dialogs added everywhere rather than surgically where
deactivation actually has business impact.

**Verified for real**: backend `tsc`/`eslint` clean (0 errors); frontend `tsc`/
`eslint`/`vite build` clean (0 errors, same 5 pre-existing warnings). Live-tested
against the real database: a Zod failure on `POST /customers` now returns
`"name: Required"`; global search for `admin` correctly includes the Administrator
account in the new `employees` group; a throwaway Employee account's own search
returned an empty `employees` group while still 403'ing on `GET /users` directly;
`prisma migrate status` confirms the index migration applied. Throwaway test account
deactivated afterward.

---

## Phase 15 — New User Signup & Approval Workflow (completed, 2026-08-21)

Full spec pasted across three messages — a public signup + Admin-approval flow; a
follow-up on suspending/reactivating Manager and Employee access; then, before any
frontend was built, a significant extension turning the permission model from
Role+Permissions into Role+Permissions+Data Scope with presets. Today every account
is created *by* an Admin/Manager (`POST /users`, role-gated) — there was no public
signup at all, so this is genuinely new surface area.

**Already satisfied, verified by reading the actual code, not assumed**:
`authenticate.ts` already re-fetches status from the database on *every* request and
rejects anything non-active — a suspended account is already locked out on its very
next request, no token-invalidation step needed. `assertManagesUser` already
restricts a Manager to their own Employees — never another Manager or Admin — by
construction. `SUSPENDED` already existed in the schema, unused, ready to wire up.

**Three questions asked and answered before writing code**: Manager permissions
became **configurable** (not full-access-forever — the deep architecture change:
`authorize()` no longer auto-bypasses for `MANAGER`, only `ADMIN` does now, and
every pre-existing Manager was backfilled with the full permission list so shipping
this didn't silently lock anyone out). Reject **keeps the record** as a new
`REJECTED` status (this app never hard-deletes users). `SUSPENDED` and `INACTIVE`
**stay two distinct statuses** — Employees.tsx keeps its existing Deactivate/
Activate button unchanged and gains a separate Suspend Access/Reactivate button.

**Backend built and verified so far**: migration applied (`AccountStatus` gains
`PENDING`/`REJECTED`; `User.role` now nullable; new `phone`/`requestedRole`/
`reviewedById`/`reviewedAt`/`suspendedById`/`suspendedAt` columns; every existing
Manager backfilled with the full permission list); `Role` widened to `Role | null`
across ~13 files (all pre-existing comparisons were already null-safe, just typed
too narrowly); a new shared `hasPermission()` helper (`utils/permissions.ts`) used
by both the `authorize()` middleware and every service-level inline check, so there
is exactly one place this rule lives; `product:create`/`product:update`/
`report:view` added as real permissions and their routes converted from role-only
gates to `authorize()`; Customer assignment/deactivate endpoints likewise converted
to `authorize('customer:update')`; public `POST /auth/signup`; `authService.login()`
now lets a `PENDING` account log in (every other non-`ACTIVE` status still blocked);
new `approve`/`reject`/`suspend`/`reactivate` endpoints and services. **A real
pre-existing gap found and closed along the way**: `productService.list()` had no
permission scoping at all, so global search would have handed real product data to
any authenticated account — including a brand-new `PENDING` one, directly violating
"❌ Products" for a pending account. Global search now checks the matching `view`
permission before running each sub-search.

**A significant addendum, requested before the frontend was built** (full detail in
`PHASE15_TODO.md`): access is now three independent layers — Role (administrative
authority — Admin/Manager/Employee), Permissions (View/Create/Edit/Delete per
module), and **Data Scope** (All vs. Assigned, per module — new). Checking the
requested module/action grid against what already exists, only two new permission
strings are actually needed (`customer:delete`, `product:deactivate` — everything
else in the grid already existed by another name). The real new work is Data Scope:
today "Admin sees all / Manager sees their team / Employee sees only their own" is
hard-coded by role in three places (`buildCustomerWhere`, `buildOrderWhere`,
`dashboard.service.ts`'s scope functions) plus per-record in
`checkCustomerAccess`/`checkOrderAccess` — making it configurable means a new
`DataScope` enum and two new nullable `User` columns (`customerDataScope`/
`orderDataScope`, deliberately *not* on Products — per the request's own reasoning,
products aren't per-employee), with `null` meaning "keep today's exact behavior," so
no backfill is needed. Also new: a distinct, Admin-granted capability letting a
specific Manager configure their own Employees' permissions (administrative
authority, not a business-data permission, even though it's built the same way).
Presets (Standard Employee/Standard Manager/Full Access/Custom) are frontend-only —
they just pre-fill the picker, nothing new is stored.

**Frontend, built after asking three more questions** (Pending Approval as its own
section on the Employees page, matching the mockup; presets reusing the backend's
own existing default-permission lists rather than inventing new ones; the optional
"I'm applying as" signup field left out for this build, no backend change needed to
add it later): `/signup` page + success screen + Login link both ways;
`PendingApproval.tsx` shown by `RequireAuth` instead of the app shell for a
`PENDING` account; a new `RequirePermission` route guard (`/reports` moved onto
`report:view`, off the old blanket Admin/Manager gate); a shared `lib/permissions.ts`
+ `PermissionPicker` component (preset dropdown, per-module Data Scope toggle,
checkboxes, the delegated-grant checkbox when applicable) used by *both* the new
Admin approval panel and the existing per-user Permissions dialog; Employees.tsx
gained the Pending Approval section, the Approve/Reject panel, and Suspend
Access/Reactivate buttons alongside the existing unchanged Deactivate/Activate.

**A real, separate bug found while wiring the frontend**: `lib/auth.ts`'s
`hasPermission()` still had the *old* "Manager bypasses everything" rule baked in —
if this had shipped as-is, every Manager's UI would have kept behaving as if they
had full access even after the backend addendum made Manager permissions real and
enforced. Fixed to match the backend's `authorize()` exactly (only Admin bypasses).

**Verified**: backend and frontend `tsc`/`eslint`/`vite build` all clean throughout.
Live-tested end to end against the real database at every stage (signup → pending
login → business-data blocked everywhere including global search → Admin approves
with a specific Data Scope split → that Employee correctly sees zero customers but
every company order, proving Data Scope is enforced per-module independently →
suspend blocks the very next request with no re-login → reactivate works
immediately → reject blocks login → a fresh Manager gets full permissions minus the
delegated grant → a Manager without that grant is blocked from editing an Employee's
permissions, then succeeds immediately after being granted it, no re-login needed).
One real bug caught during this testing (not the `hasPermission` one above):
`userService.approve()` returned the pre-Data-Scope-update user object when
permissions and a data scope were submitted together — the save was correct, the
response lied about it. Fixed and re-verified. All throwaway test accounts
deactivated/left rejected afterward. No browser automation is available in this
environment, so the frontend's actual rendering was verified by code review and
matching-shape API contract testing, not a live click-through — full detail in
`PHASE15_TODO.md`.

---

## Trash / Recycle Bin (completed, 2026-08-21)

Full spec pasted across two messages — the core Trash design (soft-delete instead of
immediate deletion, a 10-day recovery window, an Admin-only Trash page), then a
follow-up adding Permanent Delete beside Restore. Today, "removing" a Customer or
Product only ever means deactivating it (still fully visible in its own list, just
flagged); there's no way to delete an Employee, Order, or Product at all. This adds
a real, recoverable delete on top of that, framed by the user as belonging to Phase
3 / System Authorization.

**Already satisfied, verified by reading the actual code**: `OrderItem` already
snapshots `productName`/`productSKU`/`unitPrice` at order-creation time (Phase 6),
completely independent of the live `Product` row — a deleted product's historical
order line items already display correctly today, no new work needed for that
specific requirement. The `AuditLog` model already exists in the schema, defined
early on but never actually used — exactly what this feature's audit trail needs.

**The one thing this build is blocked on**: whether "Permanently Delete" should mean
a literal database row deletion. Checked every relevant foreign key's actual
`ON DELETE` behavior in the applied migration SQL, not assumed, and found it's only
really possible for `Product`:

- **Customer**: Postgres itself refuses (`ON DELETE RESTRICT` from `Order`) for any
  customer who has ever placed an order — which is most customers anyone would
  actually want to delete, not an edge case.
- **Order**: blocked the same way by its own line items, address, activity log, and
  notes — every real order has at least a line item. Cascading past that would mean
  deleting `Payment` rows too, which directly breaks the append-only payment ledger
  Phase 13 deliberately built ("never mutated in place, corrections via a reversal
  row, not a delete").
- **Employee/User**: technically FK-safe (`ON DELETE SET NULL` on every reference) —
  but doing it for real would silently turn "Created by: Amit Kumar" into
  "Created by: (nothing)" everywhere, exactly the attribution the spec says must
  survive a deletion.

So a literal `DELETE FROM` is only safe for Product. For the other three, either the
database blocks it outright, or it would quietly destroy real business history — a
genuine conflict between the spec's "permanently deleted, cannot be undone" wording
and this app's existing, deliberate architecture (the payment ledger especially).
Asked, before writing any code, whether the resolution should be: real delete where
the database allows it (Product), and **anonymize-in-place** everywhere it doesn't
(Customer/Order/Employee — scrub personal fields like name/email/phone to something
like "Deleted Customer #42," keep the row so every FK pointing at it stays valid and
existing Orders/attribution keep resolving to *something*, not null). This is a
standard pattern for exactly this situation — comparable to how a GDPR
"right to be forgotten" implementation almost always anonymizes rather than truly
deletes once there's transactional history attached.

**Decisions made confidently, no need to ask**: deletion is orthogonal to a record's
existing status (`Customer.status`, `Product.active`, `Order.orderStatus` are all
untouched by trashing, and restoring returns a record to whatever it was before, not
forcibly reset); delete-to-trash for Customer/Product reuses the existing
`customer:delete`/`product:deactivate` permissions (one new permission needed,
`order:delete`, since Order never had a deactivate-equivalent); Employee deletion is
Admin-only, no permission involved, same shape as Phase 15's Approve/Reject; the
10-day purge runs as an in-process `setInterval` (this app has no existing
background-job infrastructure and a once-a-day sweep doesn't warrant a new
dependency); deleting an Employee with assigned customers or active orders **hard-
requires** reassignment first, not just a warning; Trash is Admin-only with no
exceptions, matching the spec's own explicit wording about Manager/Employee access.

**Answered, then built**: real delete for Product, anonymize-in-place for
Customer/Order/Employee — for Order specifically nothing is actually scrubbed (it
has no personal data of its own beyond the Customer relation, which is anonymized
independently, and over-scrubbing risked destroying legitimate financial/business
data), it's just marked permanently gone from Trash.

**Built**: soft-delete columns on all four models (`deletedAt`/`deletedById`/
`deletionExpiresAt`, plus `purgedAt` on Customer/Order/User — Product has none since
its purge is a real row delete); every repository's list/lookup query now excludes
trashed rows by default, while relational includes (an Order's `customer`) are
untouched — confirmed live that a trashed Customer's name and contact info still
resolve correctly from an Order referencing them, and after Permanent Delete the same
Order correctly showed `"Deleted Customer #<id>"`. New Admin-only `/trash` endpoints
(list/restore/permanent-delete) and a `trashService.purgeExpired()` sweep running on
an hourly in-process `setInterval` (verified directly by backdating a record's
expiry and calling it manually — it anonymized the record, set `purgedAt`, and
logged the action exactly as the real hourly sweep will). The Employee/Manager
delete-with-reassignment flow was live-verified precisely as specced: blocked with
exact dependent counts, then succeeds once a replacement of the same role is
supplied, with the reassignment itself confirmed to have taken effect; Admin
accounts confirmed permanently un-deletable.

**A real bug found and fixed during live testing**: a trashed Employee could still
log in. `authService.login()` looks up the user by email (deliberately not
`deletedAt`-filtered, so signup/login can still see an email is taken) and only ever
checked `status` — but deletion is a deliberately independent axis from status, so
an ACTIVE-but-trashed employee sailed straight through. Fixed with an explicit
`deletedAt` check in `login()`, re-verified blocked afterward.

**Frontend**: a Trash page (tabs, table, Restore, and a Permanent Delete dialog
requiring the Admin to type `DELETE` to confirm — skipping the 10-day window is
deliberately harder than a normal confirm click); an Admin-only sidebar Trash link
with a live badge count; Delete buttons on Customer/Product/Order detail pages
(permission-gated); a dedicated `DeleteEmployeeDialog` in Employees.tsx that fetches
the delete-impact preview on open and shows either a plain confirmation or the
reassignment picker, matching the spec's own mockup precisely.

Backend and frontend `tsc`/`eslint`/`vite build` all clean. Full verification detail,
including every live test performed, in `PHASE16_TODO.md`'s "Built and verified"
section. All throwaway test data left in Trash rather than force-purged, matching
this session's established cleanup convention.

---

## How to run (development)

1. Configure backend environment variables: create `backend/.env` (copy from `backend/.env.example`) and set `DATABASE_URL`, `PORT`, `JWT_SECRET`.

2. From repository root, install workspace packages:

```bash
npm run install-all
```

3. Generate Prisma client and run migrations (if you have Postgres configured):

```bash
cd backend
npx prisma generate
npx prisma migrate dev --name init
npm run seed
npm run dev
```

4. Run frontend (in separate terminal):

```bash
cd frontend
npm install
npm run dev
```

Notes:

- On Windows, run backend and frontend in separate terminals instead of the combined `dev` script.
- Do not commit secrets to version control. Keep `.env` in `.gitignore`.

---

## Next recommended work (short list)

Phases 7, 8, 9, 11, 13, 14 (its concrete gaps), 15, and the Phase 3 Trash addendum
are now complete (see their sections above and `PHASE7_TODO.md`/`PHASE8_TODO.md`/
`PHASE9_TODO.md`/`PHASE11_TODO.md`/`PHASE13_TODO.md`/`PHASE14_TODO.md`/
`PHASE15_TODO.md`/`PHASE16_TODO.md`). Two phases are curated but deliberately
**deferred** — not needed at this size yet, pick up either when the need is real:
Notifications & Communication (`PHASE10_TODO.md`) and Suppliers & Purchase
Management (`PHASE12_TODO.md`, the incoming-stock counterpart to Phase 8).

No phase is currently curated as "next" — check in with the user for what to tackle
next. A concrete follow-up worth flagging from Trash: no dedicated Audit Log
*viewing* page exists yet (entries are written for every Delete/Restore/Permanent
Delete, satisfying the actual requirement, but nothing browses them) — worth
building whenever there's a real need to look back through that history.

One more concrete follow-up worth flagging: Phase 15's signup form
deliberately left out the "I'm applying as Manager/Employee" radio buttons (the
backend already accepts `requestedRole`, so this is frontend-only whenever it's
wanted), and the "Employees also gets a Suspend Access button" question was never
raised for Employees.tsx's existing Deactivate button on non-Manager/Employee rows —
worth a look if account-suspension UX gets revisited.

**Still open from Phase 14**, deliberately scoped out as broad audits rather than
single fixes (see `PHASE14_TODO.md`'s "Needs a systematic pass" section): a full
Admin/Manager/Employee × every-module permission matrix; a schema-by-schema
validation message audit; an HTTP status code consistency spot-check; filter
Apply/Clear coverage across every list page and Reports tab. Also still open: a
trigram (`pg_trgm` + GIN) index for name/phone `contains` search — not urgent at
current data size.

**Still open from the 2026-08-21 security review**, deliberately not fixed because
they need real infrastructure, not a code change: password reset tokens are logged
server-side instead of emailed (`authService.forgotPassword`) — fine for local dev,
a real problem the moment this app has real external users, since anyone who can
read server logs can take over any account. Needs actual email delivery before this
app is exposed beyond trusted internal use. The now-completed permission system
(Role + Permissions + Data Scope + delegated grants) is exactly the kind of surface
where a business-logic authorization bug hides — this is what the Phase 14 "full
permission matrix" audit above is really for, now with more surface area to cover
than when it was first deferred.

The line-item edit UI on `OrderDetail` and the follow-up date/reminder field noted in
earlier passes are now resolved: line-item editing shipped as part of Phase 11; a
follow-up/reminder field remains explicitly deferred alongside Phase 10 (it implies
notifications, which aren't built yet). The one still-open small item from Phase 6's
original scope cuts is an address-override UI on `CreateOrder` (silently defaults to
the customer's address today) — minor, not blocking.

No phase is currently curated as "next" — check in with the user for what to tackle
next.

### Post-completion audit fix (2026-08-18)

Re-verifying Phase 6 against `phases.md` after marking it done (rather than trusting the checklist) found one real gap: **Payment Status had no update control anywhere in the frontend.** Every order is created `PENDING` (Prisma default; `CreateOrder.tsx` never collected a payment status at creation), and `OrderDetail.tsx`'s "Mark next stage" buttons only covered Order Status and Delivery Status — Payment had none. The backend `PATCH /orders/:id/payment` endpoint was already fully built and previously curl-tested, it just had no caller in the UI, so no order could ever actually be marked Paid through the app.

Fixed: added an inline Payment Status `Select` to the Payment card on `OrderDetail.tsx`, wired to the existing endpoint. Deliberately **not** gated on `deliveryStatus === NOT_DISPATCHED` like Order/Delivery status updates are — the backend service applies no such restriction to payment changes, since cash-on-delivery payments are typically collected at or after delivery. Verified live: `PATCH /orders/3/payment {"paymentStatus":"PAID"}` → `200`, order updated, and `OrderActivity` correctly recorded `"Payment status changed" PENDING → PAID`; test data reverted to `PENDING` afterward. `tsc --noEmit` and `eslint` both clean on the change.

---

If you want, I can now implement Delivery Tracking (Phase 7).
