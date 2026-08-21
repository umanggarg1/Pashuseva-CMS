# Phase 4 & 5 Implementation TODO

Working checklist for Phase 4 (Customer Management) and Phase 5 (Products + Categories) — full spec in `phases.md`, build order in `development.md`. Checked off as work completes in this session.

**Guardrail (per phases.md): no order-creation logic, no inventory ledger. Customer/Product foundations only.**

## Phase 4 — Customer Management

### 4.0 Schema

- [x] `Customer`: add `status` (new `CustomerStatus` enum: `ACTIVE`/`INACTIVE`), `email`, `createdById` (→ `User`)
- [x] `CustomerAddress`: add `country` (default `"India"`)
- [x] Migrate + generate (combined with Phase 5's schema changes in one migration: `customer_product_foundations`)

### 4.1 Backend — schemas

- [x] `schemas/customer.schema.ts`: `createCustomerSchema` (name, email?, phones[] with exactly-one-primary refine, address, notes), `updateCustomerSchema`, `updateCustomerStatusSchema`, `customerListQuerySchema` (search, status, assignedEmployeeId, assignedManagerId, city, district, state, pagination, sort)
- [x] `schemas/customerNote.schema.ts`: `createCustomerNoteSchema`

### 4.2 Backend — repositories

- [x] `repositories/customer.repository.ts`: `create` (customer+phones+address in a transaction), `update`, `deactivate`, extend `findMany` with full filter/search/sort/pagination on top of existing role-scoping
- [x] `repositories/customerNote.repository.ts`: `create`, `listForCustomer`

### 4.3 Backend — services

- [x] `services/customer.service.ts`: `create` (+ "Customer created" activity), `update` (+ diff-based activity entries), `updateStatus` (deactivate/reactivate), `getActivity`. Purchase/order stats intentionally NOT added as a service method — `getById` already returns `orders[]` (empty until Phase 6), frontend computes totals from that directly rather than a dedicated (currently-inert) overview endpoint.
- [x] `services/customerNote.service.ts`: `add`, `list` (both `checkCustomerAccess`-scoped via the route middleware)

### 4.4 Backend — controllers + routes

- [x] `POST /api/customers` (create)
- [x] `PATCH /api/customers/:id` (update, `checkCustomerAccess`)
- [x] `PATCH /api/customers/:id/status` (deactivate/reactivate, Admin/Manager only)
- [x] `GET /api/customers/:id/notes`, `POST /api/customers/:id/notes`
- [x] `GET /api/customers/:id/activity`
- [x] List endpoint (`GET /api/customers`) extended with search/filter/sort/pagination query params (also hardened: non-Admin roles can't widen scope via `assignedEmployeeId`/`assignedManagerId` query params)

### 4.5 Frontend

- [x] `pages/Customers.tsx` — table, search, status filter, pagination, "+ Add Customer"
- [x] Add/Edit Customer `Dialog` — `useFieldArray` for multiple phones with a "Primary" toggle, structured address fields
- [x] `pages/CustomerDetail.tsx` — Overview (stat cards), Contact, Address, Orders (read-only, empty for now), Purchases (computed from `orders`, not stored), Activity, Notes, Assignment (display-only — managed from the Employees page's existing assignment UI)
- [x] Notes panel (list + add form) on customer detail
- [x] Activity feed (read-only) on customer detail
- [x] Wire `/customers` and `/customers/:id` into `App.tsx` (city/district/state/assigned-employee filters exist on the backend but weren't added to the list UI — search + status filter cover the common case; can be added later without backend changes)

### 4.6 Verify

- [x] `npx tsc --noEmit` (backend), `npx tsc --noEmit -p tsconfig.json` (frontend) — required one fix: `z.coerce` fields in a react-hook-form schema need `useForm<z.input<S>, unknown, z.output<S>>`, not `useForm<z.infer<S>>` (only hit in Products, not here)
- [x] `eslint` clean
- [x] curl smoke test: created a customer with 2 phones + address (exactly-one-primary validation confirmed rejecting 2 primaries), search/city-filter/pagination, update (activity logged per changed field), deactivate + reactivate, notes with author, full activity trail, `assignedEmployee`/`assignedManager` now included in list + detail responses (added — was missing, needed by the UI)
- [x] `vite build`

## Phase 5 — Products + Categories

### 5.0 Schema

- [x] `Product`: add `unit`, `minimumStock`, `createdById` (→ `User`)
- [x] `ProductCategory`: add `active` (default `true`)
- [x] New `ProductActivity` model (mirrors `CustomerActivity`)
- [x] Migrate + generate

### 5.1 Backend — schemas

- [x] `schemas/product.schema.ts`: `createProductSchema`, `updateProductSchema`, `updateProductStatusSchema`, `productListQuerySchema` (search, category, status, stock-level, pagination, sort)
- [x] `schemas/category.schema.ts`: `createCategorySchema`, `updateCategorySchema`, `updateCategoryStatusSchema`, `slugify` — also added the `ProductCategory.description` field that was missing from the schema entirely (follow-up migration `category_description`)

### 5.2 Backend — repositories

- [x] `repositories/product.repository.ts`: `create`, `update`, `updateStatus`, `findMany` with filters/search/sort/pagination, `findBySku`, activity read/write
- [x] `repositories/category.repository.ts`: `create`, `update`, `updateStatus`, `findMany` with product `_count`, `findBySlug`

### 5.3 Backend — services

- [x] `services/product.service.ts`: `create`/`update` (+ `ProductActivity` entries for price/stock changes), `updateStatus`, SKU-uniqueness check, rejects `categoryId` pointing at an inactive category, low-stock filter (`availableQty` between 0 and `minimumStock` — computed in-memory since it compares two columns, not expressible as a single Prisma where clause)
- [x] `services/category.service.ts`: `create` (auto-slugifies from name if no slug given, checks uniqueness), `update`, `updateStatus`

### 5.4 Backend — controllers + routes

- [x] `routes/api/products.ts` — list/get/activity (`authorize('product:view')`), create/update/status (`requireRole('ADMIN','MANAGER')`)
- [x] `routes/api/categories.ts` — same shape
- [x] Mounted both in `routes/api/index.ts`

### 5.5 Frontend

- [x] `pages/Products.tsx` — table, search, category/status/stock filters, low-stock indicator (with icon), pagination, "+ Add Product"
- [x] Add/Edit Product `Dialog` (name, SKU, category select, description, price, unit, stock, minimum stock, image URL) — Edit dialog not built separately; status toggle lives on the detail page instead
- [x] `pages/ProductDetail.tsx` — image (with placeholder icon when none set), name/SKU, price+unit, category, stock/minimum stock/status, activity feed
- [x] `pages/Categories.tsx` — list with product count, add, deactivate/reactivate toggle
- [x] Wire `/products`, `/products/:id`, `/categories` into `App.tsx` (`/categories` gated Admin/Manager only, matching its write-only purpose); `Sidebar` already had a `/products` link from Phase 1 scaffolding — no separate top-level "Categories" nav entry, reached via a "Manage Categories" button on the Products page instead, matching the nav tree in `phases.md` Phase 3 §10 (no standalone Categories item)

### 5.6 Verify

- [x] `npx tsc --noEmit` (backend), `npx tsc --noEmit -p tsconfig.json` (frontend)
- [x] `eslint` clean
- [x] curl smoke test: created category + product, SKU uniqueness enforced (409 on duplicate), category name/slug uniqueness enforced (409), low-stock filter correctly isolated the under-threshold product, price/stock changes logged to `ProductActivity`, deactivated a category and confirmed both halves of the rule — new products in it rejected (400) AND its existing product remained editable for unrelated fields
- [x] `vite build`

## Docs

- [x] Update `about.md` — Phase 4 & 5 status + changelog entries

## Checklist audit (2026-08-18, after initial "complete")

Went through every key point in `phases.md` Phase 4 §1-13 and Phase 5 §1-13 against the actual code (not the earlier summary) and fixed what was genuinely missing:

- [x] **Unassign customer** — spec-listed (§4), had no endpoint or UI at all. Added `POST /api/customers/:id/unassign`, service method, and an "Unassign" button in `Employees.tsx`'s assignment table.
- [x] **Assignment/activity history didn't show who did it** — `findActivity` never included the `createdBy` relation for either customers or products. Fixed both repositories; `CustomerDetail.tsx`/`ProductDetail.tsx` now render "— Assigned to Rahul by Suresh".
- [x] **Found and fixed a real access-scoping bug while testing the above**: unassigning previously cleared `assignedManagerId` too, which meant a Manager who unassigns a customer immediately loses the ability to see it (Manager visibility requires `assignedManagerId === self`). Also, a Manager-created customer had no `assignedManagerId` at all, making it invisible to its own creator. Both fixed: `unassign` now only clears `assignedEmployeeId`; `create` now auto-scopes to the creating Manager. Verified via curl both ways.
- [x] **No Sort control in the UI** for either Customers or Products (backend supported `sortBy`/`sortDir` already) — added dropdowns to both.
- [x] **No filter UI for Assigned Employee, City, District, State** on the customer list — added (assigned-employee filter shown Admin-only, since it's a no-op for Manager/Employee).
- [x] **No "Created date" filter** — wasn't even in the backend query schema. Added `createdFrom`/`createdTo` to `customerListQuerySchema` + the service's where-builder + two date inputs on the frontend.
- [x] **Categories had no Edit UI** — backend `PATCH /categories/:id` existed, frontend only had Add + activate/deactivate. Added an Edit dialog.
- [x] **Categories had no Search** — explicitly spec-listed, missing entirely (backend and frontend). Added `search` to `categoryListQuerySchema`/repository/service/controller and a search input to `Categories.tsx`.
- Deliberately left as-is: multiple product images (spec marks it optional — "main image, with optional additional images"; single `image` URL field covers the common case without adding a media-management UI this phase doesn't need).

All re-verified: `tsc --noEmit` clean on both packages, `eslint` clean, `vite build` clean, and curl-tested every new/changed endpoint including the scoping-bug fix.

---

**Phase 4 & 5 implementation complete.** All sections done and verified end-to-end (backend curl smoke tests for both modules + frontend build/typecheck/lint). This file can be deleted once reviewed, or kept as a record.
