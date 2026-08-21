# Phase 14 — System Polish & Business Workflow Improvements

## Status: real gaps done (2026-08-20); systematic-pass items intentionally scoped out for now

Spec pasted 2026-08-20. Explicitly a hardening/polish phase, not a new module — cross-
checked against the actual current code (not assumed) before writing this, since a
phase this broad is exactly where "probably fine" claims turn out wrong. Found real,
verified gaps (below) alongside a lot that's already in place from prior phases.

## Already satisfied — verified via this audit, no new work

- **Global Search** exists (`Ctrl+K`, `GlobalSearch.tsx`) — debounced, grouped
  results, full keyboard navigation, click-to-navigate. Covers Customers/Orders/
  Products. **Gap**: doesn't cover Employees — see below.
- **Loading skeletons** already used broadly (`Skeleton`) across every list/detail
  page built so far.
- **Empty states** exist on every list page already, just as plain text, not via a
  shared component, and not always with a call-to-action button — see the
  `EmptyState`/`PageHeader` gap below.
- **Cancel Order** already has a confirmation dialog (reason required).
- **Responsive layout** already had its own dedicated audit-and-fix pass (the
  root-cause `min-w-0` fix on the app shell, individual list-row fixes, dialog form
  grids stacking on narrow screens) — §11/§12's core asks are already substantially
  covered by that pass, not new work.
- **Order Details' structure** already roughly matches §4's outline (Customer /
  Products / Delivery / Payment / Notes / Activity as separate cards, none of them
  paired side-by-side, so it's already stacked-first on mobile).
- **Backend request handling** already consistently follows authenticate → authorize
  → checkAccess → zod validate → service on every protected route, established since
  Phase 3 and reaffirmed every phase since — this is existing discipline, not a gap.
- **Zod validation** already used on every backend input schema; the empty-string/
  null normalization pattern (Phase 7's Article Number addendum) is already
  established for optional fields.
- **Toast feedback** (`sonner`) already used consistently for success/error on every
  mutation across the app.
- **Status badges** already exist and are used consistently for order/payment/
  delivery status (`StatusBadge` in `Orders.tsx`) — currently local to that file, not
  extracted into a shared component (folded into the component-consistency item
  below, not a new concept).

## Real gaps found — verified against the actual code, not assumed

1. **DONE — 500 errors no longer leak raw internal error messages.**
   `errorHandler.ts` rewritten: the ZodError branch now surfaces the first failing
   field/message (e.g. `"name: Required"`) instead of the flat `"Validation failed"`
   string (the `issues` array was always in the response but the frontend's
   `ApiError` only ever read `body.error`, so this generic string was literally the
   only validation feedback any user has ever seen — confirmed by reading
   `frontend/src/lib/api.ts`). Added an explicit `Prisma.PrismaClientKnownRequestError`
   branch (P2002 → 409 "already in use", P2025 → 404 "not found"). The final
   fallback branch now always returns a fixed generic message
   (`"Something went wrong on our end. Please try again."`) at 500 — `err.message` is
   never put in the response body again, only into `logger.error(...)` as before.
2. **DONE — Global Search now covers Employees.** `userService.searchForGlobalSearch`
   added (name/email `contains`, case-insensitive) and wired into
   `search.service.ts`'s `Promise.all`. Deliberately **returns `[]` outright** for an
   Employee-role acting user rather than filtering the list down — matches
   `routes/api/users.ts`'s own Admin/Manager-only gate exactly, so an Employee can't
   even learn other employees exist via search. Manager scoping reuses the exact same
   `managerId: actingUser.id` filter `userService.list` already used. Frontend
   `GlobalSearch.tsx` gained an "Employees" result group (Users icon); since the
   group is capped at 5 results, "View all" only appears when there could plausibly
   be more, and since there's no per-employee detail route, its target is the
   `/employees` list page, not a per-id path.
3. **DONE — Deactivate now has a confirmation dialog** on both `CustomerDetail.tsx`
   and `ProductDetail.tsx`, via a new shared `ConfirmDialog` component (title +
   description + destructive confirm button), same idea as `CancelOrderDialog` in
   `OrderDetail.tsx` just generalized since deactivation doesn't need a reason field.
   Reactivate/Activate stays a single click — no confirmation needed to restore
   something to use.
4. **DONE — added shared `EmptyState` and `PageHeader` components**
   (`frontend/src/components/`), styled to match the existing `ErrorState.tsx`
   family. Adopted on the four main list pages — Customers, Products, Orders
   (desktop table + mobile card empty states), Employees — replacing their
   hand-rolled `<h1>+button>` header rows and plain-text empty cells. Not swept
   across every remaining page (Reports tabs, dialogs) — those keep their own
   inline text for now; nothing about the new components prevents adopting them there
   later.
5. **DONE — added the missing `Order` indexes.** Migration
   `20260820140000_order_status_indexes` (hand-written, applied via `migrate deploy` —
   same reason as every other migration this project: `migrate dev` refuses
   non-interactively). Adds `@@index([orderStatus])`, `@@index([deliveryStatus])`,
   `@@index([paymentStatus])`, `@@index([orderDate])` to `Order`. Purely additive, no
   data change, `prisma migrate status` confirms "Database schema is up to date."
6. **NOT DONE, correctly — trigram index for name/phone search.** Still just
   flagged, not built: a plain B-tree index on `Customer.name`/`Product.name`/
   `CustomerPhone.phone` would not speed up this app's `contains`-based search at
   all — that needs `pg_trgm` + a GIN index, a different mechanism than #5. Not
   urgent at this app's current data size; worth doing correctly in its own pass
   rather than bundled in here as a "looks right, does nothing" index.

## Needs a systematic pass — scoped, deliberately deferred (not done in this build)

Left out of this build on purpose: each of these is a broad audit spanning every
module, not a single fix, and bundling an open-ended audit into the same pass as the
six concrete gaps above risked never finishing either. Worth their own dedicated pass
when picked up.

- **Full permission matrix testing (§13).** Every prior phase live-verified its own
  *new* endpoints against a throwaway Employee account, but no single pass has
  covered the whole app (Customer/Product/Order/Employee/Payment/Reports) against
  Admin/Manager/Employee in one sweep. Worth doing as one deliberate pass rather than
  trusting the sum of many partial ones.
- **Validation message audit (§6).** Some schemas already read well (the phone-array
  "exactly one primary" refine, address field messages); others still surface zod's
  generic defaults. Needs a schema-by-schema pass, not a guess.
- **HTTP status code consistency audit (§17).** Spot-check that 409 (phone conflict,
  SKU conflict), 400 vs the zod-driven validation response, 403, and 404 are used the
  same way everywhere, not just where they were originally written.
- **Filter Apply/Clear consistency (§5).** Most filter bars already apply on change
  (no separate Apply step) and most already have some form of Clear — not yet audited
  for 100% coverage across every list page and the Reports tabs.

## Explicitly not doing

- **Article number format validation** — courier tracking-number formats vary too
  much across providers (DTDC, BlueDart, India Post, a hundred regional couriers) to
  usefully constrain with a regex; over-validating a free-form field risks rejecting
  real values for no real benefit. Staying free text.
- **No new business module** — per the spec's own framing, this phase is exclusively
  about hardening what's built, not adding functionality.
- **Confirmation dialogs added surgically, not everywhere** — only where deactivation
  actually removes something from active use (Customer, Product); not sprinkled onto
  every button, matching the spec's own explicit warning against overusing them.
  (Employees.tsx also has a Deactivate button with no confirmation, same shape as the
  two fixed here — left alone since the curated scope named Customer/Product only;
  `ConfirmDialog` is already in place if this gets picked up later.)

## Verified

Backend `tsc`/`eslint` clean (0 errors). Frontend `tsc`/`eslint`/`vite build` clean (0
errors, same 5 pre-existing `react-hooks/incompatible-library` warnings). Live-tested
against the real database: a Zod validation failure on `POST /customers` now returns
`"name: Required"` instead of the old generic string; `PATCH` on a nonexistent
customer returns a clean 404 via the existing service-level `NotFoundError` path (the
new Prisma P2025/P2002 branches exist for the cases that reach Prisma directly,
without a pre-check); global search for `admin` correctly includes the Administrator
account in the new `employees` group; a throwaway Employee account's own search for
the same term returned an empty `employees` group while still 403'ing on
`GET /users` directly, confirming the scoping matches; `prisma migrate status` shows
the new index migration applied cleanly. The throwaway test employee account created
for this check was deactivated afterward, matching every prior phase's cleanup
pattern.
