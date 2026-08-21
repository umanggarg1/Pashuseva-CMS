# Global UX Upgrade — Inline Customer Creation & Search — TODO

This isn't a new numbered phase — it's a cross-cutting UX layer the user asked to apply
to the **entire application**, not just Orders: (1) let a customer be created inline
wherever one is selected, without leaving the current flow, and (2) a consistent,
fast, debounced, permission-aware search/autocomplete experience everywhere, plus a
global `Ctrl+K` search. Full request preserved in the conversation; this file is the
working checklist, scoped down to something buildable in one pass with the highest-value
pieces first.

## Resolved decisions

- **Filename/scope**: named `PHASE1-6_TODO.md` per the request, but this is really a
  cross-phase UX layer sitting on top of the Phase 1–6 foundation, not a new phase in
  `phases.md`'s numbering. It'll be documented as its own section there (see §9 below),
  not squeezed into Phase 6.
- **Transactional customer+order creation**: `createOrderSchema` will accept **either**
  `customerId` (existing behavior) **or** `newCustomer` (inline creation payload,
  reusing `createCustomerSchema`'s shape) — never both. When `newCustomer` is given,
  `orderService.create()` creates the customer *inside the same* `prisma.$transaction`
  as the order, via a newly transaction-aware `customerRepository.create(data, tx)`.
  This satisfies "don't create the customer and order as two unrelated operations."
- **Permission gating for inline creation**: `POST /orders` is already gated on
  `order:create`, not `customer:create` — so when `newCustomer` is present, the service
  additionally checks the acting user has `customer:create` (Admin/Manager always pass;
  Employee only if granted, per Phase 3's permission model) and throws `403` otherwise.
  Same check will gate the "+ Add New Customer" button on the frontend (hide it, don't
  just rely on the backend 403) via the existing `hasPermission()` helper.
- **Real bug found and being fixed as a prerequisite**: verified live that when an
  **Employee** creates a customer today, `assignedEmployeeId`/`assignedManagerId` are
  both left `null` — the Employee immediately gets `403` trying to view or order for
  the customer they just created. This is the exact same class of bug already fixed for
  Managers (`customerService.create` auto-sets `assignedManagerId` for a Manager
  creator, but never had an Employee branch). This has to be fixed first, since it's
  Employees who'll use inline-creation-during-order-creation the most, and the bug
  would make their newly-created customer instantly unusable. Fix: when an Employee
  creates a customer, auto-set `assignedEmployeeId = self` and
  `assignedManagerId = self.managerId`.
- **Duplicate-phone protection is a soft warning, not a hard DB constraint**: the spec
  hedges with "if your business requirements allow it" — a unique constraint on phone
  numbers could break legitimate cases (shared household/family phone across two
  customers). Implemented as: while typing a phone in the Add Customer form, debounce a
  lookup against the existing customer search; if a close/exact match exists, show
  "Customer may already exist" with **Use Existing** / **Create Anyway** — never a hard
  block.
- **Search endpoint design — reuse, don't duplicate**: the user's writeup suggests
  dedicated `GET /api/customers/search`, `/api/products/search`, `/api/orders/search`
  endpoints. The existing list endpoints (`GET /customers?search=&pageSize=`, same for
  products/orders) already do permission-scoped, multi-field, case-insensitive
  `contains` search — `CreateOrder.tsx` already calls them this way. Building parallel
  `/search` routes would duplicate that logic for no real gain. **Resolved: reuse the
  list endpoints** (small `pageSize`) for per-resource autocomplete, and add exactly one
  genuinely new endpoint — `GET /api/search?q=` — for the global navbar search, which
  internally calls the same three services with a small page size and assembles a
  grouped response. Deliveries are excluded from the global search group (Phase 7 —
  dedicated delivery tracking — doesn't exist yet; today's `Order.deliveryStatus` is
  already covered under the Orders group).
- **Debouncing**: none of the existing page-level search inputs (Customers, Products,
  Orders, Categories) are debounced today — every keystroke fires a request immediately
  (confirmed by re-reading each page). Adding a shared `useDebouncedValue` hook and
  applying it to all four is in scope here, it's small and broadly valuable.
- **"Add Customer" everywhere a customer is needed**: today the only place a customer
  is *selected* (not just displayed) outside its own module is `CreateOrder.tsx`. The
  spec's other named contexts (Follow-ups, Delivery, Payments, Reports) don't exist yet
  (Phases 7–12). So the concrete deliverable is: build the picker/inline-create as a
  **reusable component** (`CustomerPicker` + `AddCustomerDialog`), wire it into
  `CreateOrder.tsx` now, and leave it ready to drop into those future phases without
  rework — not a promise to retrofit modules that don't exist.
- **Global command palette**: `Ctrl+K` opens a dialog with a single search input,
  debounced, grouped results (Customers / Orders / Products), keyboard nav (↑/↓/Enter/Esc),
  "View all results" linking to the relevant list page with the query pre-filled.

## 1. Prerequisite bug fix — DONE

- [x] `customer.service.ts`: when acting user is `EMPLOYEE`, auto-set
      `assignedEmployeeId = actingUser.id` and `assignedManagerId = actingUser.managerId`
      on create (mirrors the existing Manager branch). Widened the service's
      `ActingUser` type to include `managerId`.
- [x] Verified live: Employee creates a customer → can immediately view it, and can
      immediately place an order for it (no `403`).

## 2. Backend — inline customer creation inside order creation — DONE

- [x] `customer.repository.ts`: `create()` and `recordActivity()` now accept an
      optional `client: PrismaClientOrTx` param, so they can run inside the order's
      transaction.
- [x] `order.schema.ts`: `createOrderSchema` — `customerId` is now optional, added
      `newCustomer: customerInputSchema.optional()` (exported from `customer.schema.ts`
      rather than duplicated), `.refine()` requiring exactly one of
      `customerId`/`newCustomer`.
- [x] `order.service.ts` — `create()`: if `newCustomer` present, skips
      `assertCustomerAccessible`/pre-fetch, checks `customer:create` permission via a
      new `assertCanCreateCustomer()` (mirrors `authorize()`'s Admin/Manager-bypass
      rule), and inside the `$transaction` creates the customer via the
      transaction-aware repository method, records its "Customer created" activity,
      then proceeds with order creation using the new customer's id/address/assignment.
- [x] **Found and fixed live**: the heavier transaction (customer + phones + address +
      activity + stock decrement + order) exceeded Prisma's default 5000ms interactive-
      transaction timeout against the real Neon DB — hit the actual timeout error, not
      a hypothetical. Raised to `{ timeout: 15000 }` on all three order transactions
      (create/update/cancel) for headroom against Neon's network latency.
- [x] Verified live: single `POST /orders` with `newCustomer` creates both atomically;
      forced an insufficient-stock failure mid-transaction and confirmed the customer
      was **not** left behind (searched for it after the 400 — zero results); confirmed
      the mutual-exclusivity refine rejects both-present and neither-present; confirmed
      an Employee with `customer:create` revoked gets `403` attempting `newCustomer`.

## 3. Backend — global search endpoint — DONE

- [x] New `services/search.service.ts` — `globalSearch(actingUser, q)`: calls
      `customerService.list`, `productService.list`, and `orderService.list` each with
      `{ search: q, page: 1, pageSize: 5 }` (permission scoping already built into
      each), returns `{ customers, products, orders }`.
- [x] New `controllers/search.controller.ts` + `routes/api/search.ts` —
      `GET /api/search?q=` (`authenticate` only). Mounted in `routes/api/index.ts`.
- [x] `q` requires `min(2)` via `schemas/search.schema.ts` — short `q` gets a `400`
      instead of running three list queries for nothing.
- [x] Verified live: `GET /search?q=Rajesh` returns grouped, correctly-shaped results;
      `q=r` (too short) → `400`; unauthenticated → `401`. (Per-role scoping wasn't
      re-verified separately here since it's identical, already-proven code from each
      module's own `list()` — no new scoping logic was written.)

## 4. Frontend — shared building blocks — DONE

- [x] `lib/useDebouncedValue.ts` — generic hook (`value, delayMs=300`).
- [x] Applied to `Customers.tsx`, `Products.tsx`, `Orders.tsx`, `Categories.tsx`, and
      `CreateOrder.tsx`'s product search — each now debounces before hitting the API.
- [x] `components/CustomerPicker.tsx` — debounced search, live dropdown, "Can't find
      the customer? + Add New Customer" (gated by `hasPermission(user,
      'customer:create')`), selected-state card with "Change". Takes `value`/`onChange`.
- [x] `components/AddCustomerDialog.tsx` — generic add-customer dialog (name, multiple
      phones with primary toggle, optional address, optional notes), with the
      duplicate-phone soft-check: debounces the primary phone field, queries the
      existing customer search, and shows "Customer may already exist" with **Use
      Existing Customer** / **Create Anyway** when a match is found. Calls
      `onCreated(customer)` on success or on "Use Existing".

## 5. Frontend — wire into Create Order — DONE

- [x] `CreateOrder.tsx`: inline customer-search block replaced with `<CustomerPicker>`.
      Creating a customer inline auto-selects it immediately (no extra step).
- [x] Submission path confirmed as designed: the dialog's own `POST /customers` creates
      the customer, `CustomerPicker` auto-selects it, and order submission then sends a
      normal `customerId` — not `newCustomer`. The atomic `newCustomer`-on-order path
      built in §2 remains available on the API for any future single-step flow, and was
      verified independently via curl.

## 6. Frontend — global search (Ctrl+K) — DONE

- [x] `components/GlobalSearch.tsx` — command-palette-style `Dialog`, debounced input
      (250ms), grouped results (Customers/Orders/Products, icon + 1-line subtitle),
      keyboard nav (↑/↓ moves a shared `activeIndex` across all groups, Enter navigates,
      Esc closes), "View all N results →" per group linking to that list page with
      `?search=` pre-filled, empty/loading/error states. Reworked the open/reset-on-open
      logic to adjust state during render rather than inside `useEffect`, per a real
      lint error the React Compiler's rules caught (`setState` synchronously inside an
      effect) — not just a style nit, a real anti-pattern it flagged correctly.
- [x] Global `Ctrl+K`/`Cmd+K` listener added in `App.tsx`'s `AppShell` (mounted once,
      covers every authenticated route).
- [x] Search-trigger bar added to `Navbar.tsx` with a `Ctrl K` hint, opens the same
      dialog instance.

## 7. Verify — DONE

- [x] `npx tsc --noEmit` (backend) — clean
- [x] `npx tsc --noEmit -p tsconfig.json` (frontend) — clean
- [x] `eslint` — 0 errors (6 warnings total, all the same pre-existing
      `react-hooks/incompatible-library` pattern on `form.watch()`, one more instance
      than before purely because `AddCustomerDialog.tsx` uses the same established
      phone-array-with-primary-toggle pattern as `Customers.tsx`)
- [x] `vite build` — clean
- [x] Live curl: prerequisite Employee-assignment fix, atomic `newCustomer`-on-order
      path (success + rollback-on-failure + mutual-exclusivity + permission-gate),
      duplicate-phone lookup query, global search (success/too-short/unauthenticated)
- [ ] Manual browser click-through of Ctrl+K and the Create Order inline-add flow —
      not done in this pass (no browser automation available); everything below the UI
      layer (API contracts, permission gates, debounce behavior) is verified, but actual
      pointer/keyboard interaction in a real browser has not been clicked through by a
      human yet. Recommend a quick manual pass before calling this fully done.

## 8. Explicitly out of scope for this pass

- Retrofitting a customer picker into Follow-ups/Delivery/Payments/Reports — those
  modules don't exist yet (Phases 7–12).
- Dedicated per-resource `/search` REST endpoints — resolved above to reuse existing
  list endpoints instead.
- A hard DB-level unique constraint on customer phone numbers.
- Full "search by customer ID" as a distinct field (name/phone/email search already
  covers the practical cases; numeric-only queries already partial-match against phone).

## 9. Docs — DONE

- [x] Added "Cross-Cutting Requirement — Inline Customer Creation & Global Search" to
      `phases.md`, right after Phase 6 / before Phase 7 — deliberately not squeezed into
      Phase 6's own numbering.
- [x] `about.md` — new dated changelog section plus a status-summary line, matching the
      convention used for every other completed phase.

---

**Implementation complete**, with one caveat: sections 1–7 and 9 are all done and
verified — backend fully live-tested via curl, frontend fully typechecked/linted/built.
The one thing *not* done is an actual human click-through of the UI in a browser
(Ctrl+K, arrow-key nav, the Create Order inline-add-customer flow end-to-end) — no
browser automation was available in this environment. Recommend trying it directly
before considering this fully signed off. This file can be deleted once reviewed, or
kept as a record.
