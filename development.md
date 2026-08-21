# Development Guide

A practical, phase-by-phase walkthrough of how this project is being built — what's done, how it was done, and the concrete steps to build what's next. Read this if you want to pick up the project and keep going.

## How the docs fit together

- **`crm.md`** — the product requirements and data model (the "what" and "why").
- **`phases.md`** — the 14-phase spec (the "what to build, in what order").
- **`about.md`** — status log and changelog (the "what's actually done, verified, and when").
- **`development.md`** (this file) — the "how": setup, conventions, and a step-by-step build log/plan per phase.

---

## Prerequisites

- Node.js 20+ and npm
- A PostgreSQL database (this project currently points at a Neon serverless Postgres instance — see `backend/.env`)

## Setup from scratch

```bash
npm run install-all          # installs frontend + backend workspaces
cd backend
cp .env.example .env         # then fill in DATABASE_URL, PORT, JWT_SECRET, CORS_ORIGIN
npx prisma generate          # generates the Prisma client into src/generated/prisma
npx prisma migrate dev       # applies migrations to your database
npm run seed                 # creates the admin@example.com user
```

## Running it day to day

```bash
# terminal 1
cd backend && npm run dev      # http://localhost:4000

# terminal 2
cd frontend && npm run dev     # http://localhost:5173
```

Quality checks (run from repo root):

```bash
npm run lint            # eslint . (flat config, covers both packages)
npm run format:check    # prettier --check .
```

Per-package:

```bash
cd backend && npx tsc --noEmit
cd frontend && npx tsc --noEmit -p tsconfig.json
cd frontend && npx vite build
```

---

## Project structure

```
backend/
  prisma/
    schema.prisma          # all Prisma models + @@index on every FK
    migrations/             # applied migrations (never edit an applied one — add a new one)
    seed.ts                 # creates the admin user
  prisma.config.ts          # Prisma 7 CLI config (schema path, migrations, seed cmd, DATABASE_URL)
  src/
    index.ts                # entrypoint — loads dotenv, starts the server
    app.ts                  # express app — cors (must come before json/cookie parsers), routers, error handler
    config.ts               # zod-validated typed env (config.databaseUrl, config.port, ...)
    logger.ts                # console wrapper (info/warn/error)
    lib/prisma.ts            # Prisma client singleton, wired to @prisma/adapter-pg
    generated/prisma/        # generated Prisma client (gitignored — `npx prisma generate` to rebuild)
    routes/api/               # thin route files — wire a path to a controller method
    controllers/               # req/res only — parse input, call a service, send response
    services/                   # business logic — calls repositories, throws HttpError/NotFoundError
    repositories/                 # the only layer that talks to Prisma
    schemas/                       # zod schemas for request validation
    middleware/errorHandler.ts      # catches HttpError / ZodError / anything else -> JSON response
    utils/asyncHandler.ts            # wraps async controller methods so errors reach errorHandler
    utils/httpError.ts                # HttpError, NotFoundError

frontend/
  components.json           # shadcn/ui CLI config — `npx shadcn add <component>` uses this
  src/
    main.tsx                # QueryClientProvider + BrowserRouter + Toaster
    App.tsx                  # top-level layout + <Routes>
    lib/api.ts                # fetch wrapper, reads VITE_API_BASE_URL
    lib/queryClient.ts         # shared TanStack Query client
    lib/utils.ts                 # cn() class-merge helper
    components/ui/                 # shadcn primitives (button, card, dialog, sheet, table, form, ...)
    components/                      # app-level components (Sidebar, Navbar, PageContainer, ErrorState)
    pages/                             # route-level pages
```

---

## Conventions — read this before building a new phase

**Backend: adding a new module (e.g. "products") always follows this shape:**

1. `schemas/product.schema.ts` — zod schemas for params/body (e.g. `productIdParamSchema`, `createProductSchema`).
2. `repositories/product.repository.ts` — the only file that imports `lib/prisma`. Plain data-access functions.
3. `services/product.service.ts` — business logic. Calls the repository. Throws `NotFoundError`/`HttpError` from `utils/httpError.ts` for expected failure cases.
4. `controllers/product.controller.ts` — parses `req` with the zod schema, calls the service, calls `res.json(...)`. No try/catch needed.
5. `routes/api/products.ts` — `router.get('/', asyncHandler(productController.list))` etc. Mount it in `routes/api/index.ts`.

`errorHandler.ts` already understands `ZodError` (→ 400 with issues) and `HttpError`/`NotFoundError` (→ their `.status`) — you don't need to handle those in the controller.

**Frontend: adding a new page:**

1. Build UI from `components/ui/*` primitives (`Button`, `Card`, `Table`, `Dialog`, `Sheet`, `Skeleton`, `Form`+`Input`+`Label`). Add more with `npx shadcn add <name>` (uses `components.json`) or hand-write following the existing files' pattern.
2. Data fetching: `useQuery`/`useMutation` from `@tanstack/react-query`, calling `apiFetch<T>('/path')` from `lib/api.ts`. Show `Skeleton` while pending, `ErrorState` on failure (see `pages/Home.tsx` for the pattern).
3. Forms: `react-hook-form` + `@hookform/resolvers/zod` + the `Form`/`FormField`/`FormItem`/`FormLabel`/`FormControl`/`FormMessage` primitives from `components/ui/form.tsx`.
4. Register the route in `App.tsx`'s `<Routes>`, and add the nav link in `components/Sidebar.tsx`'s `navItems` (it's shared by both the desktop sidebar and the mobile `Sheet` drawer automatically).
5. Toasts: `import { toast } from 'sonner'`, call `toast.success(...)` / `toast.error(...)` — the `<Toaster />` is already mounted in `main.tsx`.

**Database:**

- Every foreign-key column gets `@@index([...])` in `schema.prisma` — don't add a relation without one.
- After any `schema.prisma` change: `npx prisma migrate dev --name <describe_the_change>`, then `npx prisma generate` (migrate does this automatically, but run it manually after just editing the generator block).
- Never hand-edit an already-applied migration under `prisma/migrations/` — add a new one.

---

## Phase-by-phase build log

### Phase 1 — Project Foundation — ✅ done

What was actually done, in order:

1. Scaffolded `frontend/` (Vite + React + TS + Tailwind) and `backend/` (Express + TS + Prisma) as npm workspaces.
2. Added tooling: `.gitignore`, `.env.example`, `.editorconfig`, `.prettierrc`.
3. Built layout shell: `Sidebar`, `Navbar`, `PageContainer`, `Breadcrumbs`.
4. Replaced hand-rolled UI placeholders with real shadcn/ui primitives (`components/ui/*`, `components.json`, CSS-variable theme in `tailwind.config.cjs` + `styles/tailwind.css`, `cn()` helper).
5. Added the rest of the frontend stack: TanStack Query, React Hook Form + resolvers, Zod, Lucide icons, Motion (installed, not yet used — no animated feature exists before Phase 7).
6. Added `lib/api.ts` (fetch wrapper) + `lib/queryClient.ts`, wired into `main.tsx`; `Home.tsx` proves the path end-to-end against the real `/api/health` endpoint.
7. Added real mobile navigation (`components/ui/sheet.tsx` drawer wired to the `Navbar` hamburger button).
8. Installed and configured ESLint (flat `eslint.config.js`, replacing the deprecated `.eslintrc.json`) and Prettier at the workspace root.

Verify: `npm run lint`, `npm run format:check`, `cd frontend && npx tsc --noEmit -p tsconfig.json && npx vite build`.

### Phase 2 — Database + Backend Architecture — ✅ done

What was actually done, in order:

1. Modeled the core entities in `schema.prisma`: `User`, `Customer`, `CustomerPhone`, `CustomerAddress`, `Product`, `ProductCategory`, `Order`, `OrderItem`, `DeliveryTracking`, plus `CustomerNote`, `CustomerActivity`, `Notification`, `AuditLog`.
2. Fixed missing opposite relation fields (Prisma won't validate without them), added `@@index` to every FK column, migrated (`npx prisma migrate dev`), and seeded an admin user.
3. Upgraded to Prisma ORM 7 (`prisma-client` generator, `prisma.config.ts`, `@prisma/adapter-pg` at runtime — the old `prisma-client-js` + `datasource.url` pattern is gone in v7).
4. Built the backend layering: `controllers/`, `services/`, `repositories/`, `schemas/`, `utils/` (see Conventions above), and refactored the customers module into it as the reference implementation.
5. Added `errorHandler.ts` handling for `ZodError` and `HttpError`.

Verify:

```bash
cd backend && npx tsc --noEmit
npm run dev   # then in another terminal:
curl http://localhost:4000/api/health
curl http://localhost:4000/api/customers        # 200 []
curl http://localhost:4000/api/customers/abc    # 400 (zod validation)
curl http://localhost:4000/api/customers/99999  # 404 (NotFoundError)
```

### Phase 3 — Authentication, Authorization, Roles & Permission Management — ✅ done

Completed and verified 2026-08-18 — see `about.md`'s Phase 3 section for the full changelog of what was actually built, and `PHASE3_TODO.md` for the build checklist it was tracked against. The plan below is kept as a reference for the pattern that was followed (schema → repositories → services → middleware → controllers/routes → frontend), since Phase 4 and 5 follow the same shape.

This phase is bigger than "add login" — it's the full auth + role + per-employee-permission + customer-assignment system described in `phases.md` Phase 3. Admin creates Managers, Managers create/manage Employees, Managers assign customers to Employees and grant/revoke individual permissions, and every request an Employee makes is checked against both their permissions _and_ whether the record is actually assigned to them.

**Schema changes first** (`schema.prisma`):

1. Extend `User`: add `status` (`ACTIVE`/`INACTIVE`/`SUSPENDED`, default `ACTIVE`), `managerId Int?` self-relation (`manager User? @relation("ManagerEmployees", fields: [managerId], references: [id])` + `employees User[] @relation("ManagerEmployees")`), `lastLoginAt DateTime?`. `role` already exists as a plain `String` — either keep it and validate against `ADMIN`/`MANAGER`/`EMPLOYEE` in zod, or convert to a Prisma `enum Role`.
2. Add `UserPermission` model: `id`, `userId` (→ `User`, `@@index`), `permission String` (e.g. `"customer:view"`), `grantedBy Int?` (→ `User`), timestamps. `@@unique([userId, permission])` so grants can't duplicate.
3. Extend `Customer`: add `assignedEmployeeId Int?` and `assignedManagerId Int?` (both → `User`, both `@@index`'d — this is exactly the FK-index convention from Phase 2).
4. Add `PasswordResetToken` model: `id`, `userId` (→ `User`, `@@index`), `tokenHash String`, `expiresAt DateTime`, `usedAt DateTime?`, `createdAt`.
5. `npx prisma migrate dev --name auth_roles_permissions`.

**Backend, in dependency order:**

1. Check and install current versions: `npm view bcrypt version`, `npm view jsonwebtoken version`, `npm view cookie-parser version`, `npm view express-rate-limit version` — don't assume any version number written here or in `phases.md` is still current when you build this. Add matching `@types/*` as devDeps.
2. `schemas/auth.schema.ts` — `loginSchema`, `forgotPasswordSchema`, `resetPasswordSchema`, `changePasswordSchema` (password: min 8 chars, at least one letter, one number — enforce with a zod `.regex`). `schemas/user.schema.ts` — `createUserSchema` (admin/manager creating a Manager/Employee), `updateUserSchema`, `updatePermissionsSchema` (array of permission strings).
3. `repositories/user.repository.ts` — `findByEmail`, `findById`, `create`, `updateStatus`, `updateLastLogin`. `repositories/permission.repository.ts` — `getForUser`, `replaceForUser` (transactional delete+insert is simplest for "Save Permissions"). `repositories/passwordReset.repository.ts`.
4. `services/auth.service.ts` — login (verify password with bcrypt, check `status === 'ACTIVE'`, update `lastLoginAt`, issue JWT), forgot/reset/change password (hash reset tokens before storing, single-use via `usedAt`, short expiry e.g. 1 hour). `services/permission.service.ts` — default permission set on Employee creation (see the "Default Employee Permissions" list in `phases.md`), grant/revoke.
5. `middleware/authenticate.ts` — read the JWT from an **HttpOnly cookie** (not `Authorization` header / localStorage — this phase explicitly calls for cookie-based sessions), verify, attach `req.user = { id, role, permissions }`. Set the cookie in the login controller with `httpOnly: true, secure: true, sameSite: 'lax'`.
6. `middleware/authorize.ts` — `authorize('customer:create')` checks `req.user.permissions` for Employees; Admin/Manager bypass permission checks per the Permission Matrix in `phases.md`.
7. `middleware/checkAccess.ts` — `checkCustomerAccess()` / `checkOrderAccess()`: Admin passes always; Manager passes if the record's `assignedManagerId` (or the order's customer's) matches `req.user.id`; Employee passes only if `assignedEmployeeId` matches `req.user.id`. This is the layer that turns "Rahul can edit customer:update" into "Rahul can edit _his own_ customers".
8. `middleware/rateLimiter.ts` — `express-rate-limit` on `/api/auth/login` specifically (e.g. 5 attempts / 15 min per IP+email).
9. Controllers/routes: `controllers/auth.controller.ts` (`login`, `logout`, `me`, `forgotPassword`, `resetPassword`, `changePassword`) → `routes/api/auth.ts`. `controllers/user.controller.ts` (`list`, `create`, `update`, `updateStatus`, `updateRole`, `getPermissions`, `updatePermissions`) → `routes/api/users.ts`. Add `POST /api/customers/:id/assign`, `POST /api/customers/bulk-assign`, `POST /api/customers/:id/reassign` to the customers module (they need `checkAccess` too — a Manager can only assign customers/employees within their own team).
10. Protect the existing `routes/api/customers.ts` with `authenticate` + `authorize('customer:view' | ...)` + `checkAccess` per route, per the "Example API Authorization" flows in `phases.md`.
11. Update `prisma/seed.ts` to hash the admin's password with bcrypt instead of storing it in plaintext (flagged as a known issue since Phase 2), and give it `role: 'ADMIN'`, `status: 'ACTIVE'`.

**Frontend:**

1. `pages/Login.tsx` — `react-hook-form` + `zodResolver` + `Form`/`FormField` primitives, password-visibility toggle (`lucide-react`'s `Eye`/`EyeOff`), a subtle `motion` entrance animation (first real use of the `motion` dependency installed in Phase 1). `pages/ForgotPassword.tsx`, `pages/ResetPassword.tsx`.
2. Since auth is cookie-based, `lib/api.ts`'s `fetch` calls need `credentials: 'include'` — no token to attach manually. Add a `lib/auth.ts` with a `useCurrentUser()` hook (`useQuery` against `GET /api/auth/me`) instead of hand-rolled token storage.
3. A route guard component wrapping protected `<Route>` elements in `App.tsx`, redirecting to `/login` when `useCurrentUser()` resolves to unauthenticated; a permission-aware wrapper for `Sidebar`'s `navItems` so it only renders links the current user's role/permissions actually allow (remember: this is UX only, the backend is the real boundary — see `phases.md` §31).
4. `pages/Employees.tsx` (Manager/Admin) — list with a permissions `Dialog` matching the "Employee Permissions" checkbox layout in `phases.md` §14, and customer assignment / bulk-assignment / reassignment UI matching §16–18.

**Deliverable / how to know it's done:** Admin creates a Manager → Manager logs in → Manager creates an Employee with default permissions → Manager assigns a customer to that Employee → Employee logs in, sees only their assigned customer, can act on it only within their granted permissions, and any direct API call outside those bounds (wrong customer, missing permission, wrong role) gets rejected server-side with 401/403 regardless of what the UI shows.

### Phase 4 — Customer Management — ✅ done

Completed and verified 2026-08-18, including a follow-up checklist audit that found and fixed real gaps (Unassign, activity attribution, sort/filter UI, a live access-scoping bug) — see `about.md`'s Phase 4 & 5 section for the full changelog. The plan below is kept as the original build reference.

**Core principle (per `phases.md` Phase 4): this phase is the customer foundation only. No order-creation logic and no inventory logic belong here — Phase 6 owns that.** Customer assignment itself is already built (Phase 3's `assign`/`bulk-assign`/`reassign` endpoints, `checkCustomerAccess`, `CustomerActivity` logging) — Phase 4 is about surfacing a real customer module around it, not rebuilding assignment.

Follow the customers module from Phase 2/3 as your template — it already has `schema/repository/service/controller` for `list` (role-scoped)/`getById`/assignment. Extend it:

**Schema additions to `Customer`** (currently just `name`, `notes`, `phones[]`, `addresses[]`, assignment fields):

1. `status` — `AccountStatus`-style enum (`ACTIVE`/`INACTIVE`) or a new `CustomerStatus` enum; deactivation instead of hard delete (§12).
2. `email String?`.
3. `createdById Int?` → `User` (who created the customer).
4. `CustomerAddress` already has `line1`/`line2`/`city`/`district`/`state`/`pincode`/`landmark` — add `country String @default("India")` (or your default) per §3.
5. `CustomerPhone` already has `phone`/`label`/`isPrimary` — this already matches §2's "explicit primary phone" requirement, nothing to add there.

**Backend:**

1. `schemas/customer.schema.ts` — add `createCustomerSchema` (name, email?, phones[] with exactly one `isPrimary: true`, address, status defaults to `ACTIVE`), `updateCustomerSchema`, list-query schema for search/filter/sort/pagination params (status, assignedEmployeeId, assignedManagerId, city, district, state, createdAt range).
2. `repositories/customer.repository.ts` — add `create`, `update`, `deactivate` (sets status, doesn't delete), and extend `findMany` to accept the full filter set + pagination (`skip`/`take`) + sort, on top of the role-scoping `where` clause that already exists from Phase 3.
3. `services/customer.service.ts` — `create` (creates customer + phones + address in one transaction, records a `CustomerActivity` "Customer created"), `update` (records what changed as activity, e.g. "Phone number changed"), `deactivate`. Compute total purchases from `Order` aggregates in the service, not a stored column (§8) — add this once Phase 6 has real orders; until then the customer detail page's purchase stats are legitimately zero/empty.
4. `controllers/customer.controller.ts` + `routes/api/customers.ts` — add `POST /` (create), `PATCH /:id` (update, needs `checkCustomerAccess`), `PATCH /:id/status` (deactivate, Admin/Manager only), `POST /:id/notes` + `GET /:id/notes` (uses the existing `CustomerNote` model — needs a small `notes.repository.ts`/service or fold into `customer.service.ts`), `GET /:id/activity` (reads `CustomerActivity`).

**Frontend:**

1. `pages/Customers.tsx` — `Table` + search input + `Select` filters (status, assigned employee, city/state) + pagination, following the `Employees.tsx` patterns for `useQuery`/`Skeleton`/`ErrorState`.
2. `pages/CustomerDetail.tsx` — tabs or stacked sections matching `phases.md` §5 (Overview, Contact, Address, Orders [read-only list], Purchases, Activity, Notes, Assignment). Orders section just renders whatever `customer.orders` already returns (empty until Phase 6) — don't build order creation UI here.
3. Add/Edit `Dialog` using the `Form` primitives, with a phone-number field array (react-hook-form's `useFieldArray`) so users can add/remove multiple phones and mark one primary.
4. A Notes panel (list + add-note form) and an Activity feed (read-only list, newest first).

Full field/UI spec: `phases.md` Phase 4.

### Phase 5 — Products + Categories — ✅ done

Completed and verified 2026-08-18 alongside Phase 4 — see `about.md`'s Phase 4 & 5 section. The plan below is kept as the original build reference.

**Core principle (per `phases.md` Phase 5): catalog + a simple stock counter only. No purchase orders, warehouses, batch/expiry tracking, or stock ledger — that's a separate later Inventory phase if the business ever needs it.**

**Schema additions** (`Product` currently has `name`/`description`/`category`/`sku`/`price`/`availableQty`/`image`/`active` — close, but missing a few fields the refined spec calls for):

1. `unit String` — e.g. `"10 kg"`, `"1 piece"` (§2 — price is meaningfully per-unit for this business).
2. `minimumStock Int @default(0)` — `availableQty` already covers "current stock"; add the low-stock threshold to compare against.
3. `createdById Int?` → `User`.
4. `images` — either keep `image` as the single main image (simplest, matches "don't build a media library yet") or add a small `ProductImage` side table only if more than one image per product is actually needed on day one; default to the single-field approach.
5. `ProductCategory` — add `active Boolean @default(true)` (deactivate, don't delete, per §7).

**Backend:**

1. `schemas/product.schema.ts` — `createProductSchema`, `updateProductSchema`, list-query schema (search, category, status, stock-level filter, pagination, sort). `schemas/category.schema.ts` similarly.
2. `repositories/product.repository.ts`, `repositories/category.repository.ts` — `category.repository.ts`'s list should include a product count (`_count: { select: { products: true } }` via Prisma) per §6.
3. `services/product.service.ts` — `create`/`update` (record `ProductActivity`-style entries — reuse the `CustomerActivity` pattern but for products, e.g. a new lightweight `ProductActivity` model or just log via the existing `AuditLog`; pick whichever avoids a near-duplicate model — a dedicated `ProductActivity` mirroring `CustomerActivity` is the more consistent choice), `deactivate`. Compute low-stock status (`availableQty < minimumStock`) in the service/response, not stored.
4. `services/category.service.ts` — `create`/`update`/`deactivate` with the "existing products keep their category, but it's unselectable for new products once inactive" rule from §7 enforced in `product.service.ts`'s create/update (reject a `categoryId` pointing at an inactive category).
5. Controllers/routes for both, following the `customers.ts` pattern — `authorize('product:view')` on reads (permission already exists from Phase 3), `requireRole('ADMIN', 'MANAGER')` on writes (product management isn't in the Employee permission list per the Phase 3 matrix).

**Frontend:**

1. `pages/Products.tsx` — list with search, category/status/stock filters, low-stock visual indicator.
2. `pages/ProductDetail.tsx` — image, name/SKU, price+unit, category, stock, status, activity feed — per `phases.md` §11.
3. `pages/Categories.tsx` — simple list/create/deactivate, showing product count per category.
4. Add/Edit `Dialog`s using the `Form` primitives; image upload can start as a plain URL field (`image: string`) unless file upload infrastructure already exists — don't build a file-upload pipeline just for this if it doesn't.

Full field/UI spec: `phases.md` Phase 5.

### Phase 6 — Order Management — ✅ done

Completed and verified 2026-08-18 — see `about.md`'s Phase 6 section for the full changelog, and `PHASE6_TODO.md` for the build checklist. Before writing any code, a Phase 4/5/6 connection audit (`phases.md` §44) resolved 7 gaps up front — most importantly, that `checkOrderAccess` must scope by the order's _customer's_ live assignment, not a snapshot on the order itself, and that stock/customer-status validation needed adding to the spec's own checklist. Two more ambiguities were resolved during implementation: the cancel/edit cutoff is gated by `deliveryStatus === NOT_DISPATCHED` (not a mix of order-status and delivery-status values as the spec's tables literally show), and stock is deducted at order _creation_, not at a separate "confirm" step that the UI never actually has.

Build order actually followed, if picking this pattern up again for a similar module:

1. Schema first — enums, `Order`/`OrderItem` extensions, `OrderAddress`/`OrderActivity`/`OrderNote`, the `order:cancel` permission. Watch for Prisma's relation-naming requirement the moment a model gets a _second_ FK to the same target model (here, `Order`→`User` three times) — every one of them needs an explicit `@relation` name, including ones that were previously fine unnamed.
2. `lib/prisma.ts` gained a `PrismaClientOrTx` type before touching any repository — this module was the first one where a single operation (`create()`) needed multiple repositories (`order`, `product`) to participate in one `prisma.$transaction`, so every repository method that needs to run inside it takes an optional transaction-client parameter instead of always importing the singleton.
3. Repository → service → controller → route, same layering as every other module. The one new repository technique: atomic stock changes via `updateMany({ where: { availableQty: { gte: quantity } }, data: { availableQty: { decrement: quantity } } })` rather than read-then-write, so concurrent orders can't both pass a stale check.
4. Frontend: list → create (the complex one, a customer/product search-and-select + line-item builder) → detail (status stepper, activity, notes, cancel/reorder actions).
5. Verify with curl against the real database, specifically proving the "never trust the frontend price" property by sending a forged price field and confirming it was ignored — this is the one property in the whole phase that's meaningless to just code-review, it has to be watched happen.

`Order` + `OrderItem` were already modeled since Phase 2 with price-snapshot fields (`productName`, `productSKU`, `unitPrice` captured at purchase time) — Phase 6 was about actually populating them correctly, not adding them.

### Phase 7 — Delivery Tracking — not started

`DeliveryTracking` is already modeled as an append-only history table (never overwrite `Order.deliveryStatus` without also inserting a `DeliveryTracking` row). This is where the `motion` dependency installed in Phase 1 finally gets used, for the status-tracker UI. See `phases.md` Phase 7 and `crm.md` sections 8–9, 11.

### Phase 8 — Dashboard — not started

Only build this once Phases 4–7 are real — `Home.tsx`'s stat cards are still hardcoded `—` placeholders; replace them with real aggregate queries once there's real data to aggregate. See `phases.md` Phase 8.

### Phases 9–14 — not started

Follow `phases.md` for the full spec of Notes/Tasks/Follow-ups, Search/Import/Export, Analytics, Notifications/Audit Logs, Security hardening, and Production deployment, in that order. Each should follow the same backend layering and frontend conventions established above — there's no new architectural pattern needed, just more modules built the same way.

---

## Troubleshooting

- **`Can't reach database server`** — the Neon database auto-suspends when idle; the first request after a while wakes it and can take a few seconds. Retry.
- **`Module '"@prisma/client"' has no exported member 'PrismaClient'`** — the Prisma client hasn't been generated. Run `npx prisma generate` from `backend/`.
- **Backend `tsc` fails on `prisma/seed.ts` with a `rootDir` error** — make sure `backend/tsconfig.json` still has `"include": ["src/**/*.ts"]`; `seed.ts` is intentionally outside it and typechecked separately.
- **ESLint warns about `MODULE_TYPELESS_PACKAGE_JSON`** — shouldn't happen; root `package.json` has `"type": "module"` specifically so `eslint.config.js` (which uses `import`/`export`) loads without it.
- **A `frontend/src/components/ui/*` file trips `react-refresh/only-export-components`** — expected and harmless; these files export helper values (e.g. `buttonVariants`) alongside the component, which is the standard shadcn/ui pattern.
