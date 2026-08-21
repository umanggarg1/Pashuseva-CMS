# Phase 3 Addendum — Trash / Recycle Bin & Soft Delete

## Status: done (2026-08-21)

Spec pasted 2026-08-21 across two messages (the core Trash design, then a follow-up
adding Permanent Delete beside Restore). Checked against the actual schema/FK
constraints before writing this — that check surfaced a real conflict between the
spec's "Permanently Delete... cannot be undone" promise and this app's existing
database constraints, resolved by asking (see "Decisions made" below) before writing
any code.

## Already satisfied — verified via this audit, no new work

- **Product line-item history already survives a product being removed.**
  `OrderItem.productName`/`productSKU`/`unitPrice` are captured as a snapshot at
  order-creation time (Phase 6), completely independent of the live `Product` row.
  "Cow Feed, Quantity: 5, Price at purchase: ₹850" already displays correctly today
  even if the product were deleted right now — nothing to build for this specific
  requirement.
- **`AuditLog` model already exists** (`id, userId?, action, meta?, createdAt`),
  defined in the schema since early on but never actually used anywhere. This is
  exactly what the spec's audit-log requirement needs — reused, not rebuilt.
- **Deletion being orthogonal to existing status fields is a natural fit, not a
  conflict.** `Customer.status`, `Product.active`, `Order.orderStatus`, and
  `User.status` all already exist independently of anything Trash needs to add —
  `deletedAt`/`deletedById`/`deletionExpiresAt` sit alongside them, untouched by
  deactivate/cancel/suspend and vice versa.

## The one thing this is blocked on: "Permanent Delete" vs. real foreign keys

Checked every relevant foreign key's `ON DELETE` behavior directly in the applied
migration SQL (not assumed) before writing this. Result:

| Referenced by | Constraint | Real SQL `DELETE FROM` possible? |
|---|---|---|
| `Product` ← `OrderItem.productId` | `ON DELETE SET NULL` | **Yes** — safe, and the snapshot columns mean nothing historical is lost either way. |
| `Customer` ← `Order.customerId`, `CustomerPhone`, `CustomerAddress` | `ON DELETE RESTRICT` | **No** — Postgres refuses the delete outright for any customer with even one order. That's most real customers, not an edge case. |
| `Order` ← `OrderItem`, `OrderAddress`, `OrderActivity`, `OrderNote`, `Delivery`, **`Payment`** | `ON DELETE RESTRICT` | **No** — blocked by its own line items alone; every real order has at least one. Cascading the delete would mean deleting `Payment` rows, which directly breaks the append-only payment ledger Phase 13 deliberately built ("never mutated in place, corrections via a reversal row, not a delete"). |
| `User` (Employee) ← `Order.createdById`/`assignedEmployeeId`/`cancelledById`, `CustomerNote`, `StockHistory`, `Payment.createdById`, etc. | `ON DELETE SET NULL` | Technically yes — but it would silently turn "Created by: Amit Kumar" into "Created by: (nothing)" everywhere, which is the exact attribution the spec says must survive a deletion. |

So a literal `DELETE FROM` is only actually safe for **Product**. For Customer,
Order, and Employee, the database will either reject the operation outright
(Customer, Order) or silently destroy required historical attribution (Employee) —
there's no way to honor "permanently delete, cannot be undone" as a real row removal
for three of the four entity types without either losing real business history or
weakening a deliberate design decision from an earlier phase.

**Asked, not assumed** — and answered: "Permanently Delete" means a real `DELETE
FROM` where the database allows it (Product), and **anonymize-in-place** everywhere
it doesn't (Customer/Order/Employee: personal fields scrubbed, the row kept so every
FK pointing at it stays valid and existing Orders/attribution keep resolving to
*something*, not null). For Order specifically, nothing is actually scrubbed —
unlike Customer/Employee it has no personal data of its own beyond what the Customer
relation already carries, and over-scrubbing risks destroying legitimate financial/
business record data (matching this app's established "never destroy the ledger"
stance) — Order's permanent delete just marks it as permanently gone from Trash.

## Decisions made without needing to ask (confident, low-stakes, documented here)

- **Data Scope-style independence from existing status fields** — trashing never
  changes `status`/`active`/`orderStatus`; restoring returns a record to whatever
  those were before, unchanged. Two orthogonal axes, not one concept relabeled.
- **Permission mapping for delete-to-trash**: reuse `customer:delete` (already
  exists, currently only gates the Deactivate/Reactivate toggle — now also gates
  Delete-to-Trash, since both are "remove from active use" actions of increasing
  severity) and `product:deactivate` (ditto). Adding one new permission,
  `order:delete` (Order never had a deactivate-equivalent to reuse). Employee
  deletion stays Admin-only via `requireRole('ADMIN')`, no permission involved, same
  shape as Approve/Reject from Phase 15.
- **Scheduled purge mechanism**: this app has no existing background-job
  infrastructure and no new dependency is warranted for a once-a-day sweep — an
  in-process `setInterval` (checked hourly) calling one `trashService.purgeExpired()`
  function, running inside the same Node process as the API server. Documented as a
  pragmatic choice for this app's current single-process deployment shape, not a
  claim that it's the right choice for every deployment; the spec's own wording
  ("depending on your deployment") already anticipates this.
- **Employee-delete reassignment is a hard requirement**, not just a suggestion —
  matches the spec's own "I recommend requiring reassignment" and prevents orphaned
  assignments outright rather than allowing then warning.
- **"Active orders" for the reassignment-required check** means orders whose
  `orderStatus` isn't `CANCELLED`/`COMPLETED` — mirrors the definition already used
  elsewhere in this app for similar "still in flight" checks.
- **Trash is Admin-only, no exceptions** — matches the spec's own explicit "Manager:
  No Trash access unless you explicitly give it later. Employee: No Trash access."
  Not permission-gated at all, just `requireRole('ADMIN')` on every Trash route,
  same shape as the Employee-management router.

## New work — all done

1. Schema: `deletedAt`/`deletedById`/`deletionExpiresAt` on `User`, `Customer`,
   `Order`, `Product`; `order:delete` permission.
2. Every existing list/lookup query for these four models needs to exclude trashed
   rows by default — a systematic pass across `customer.repository.ts`,
   `order.repository.ts`, `product.repository.ts`, `user.repository.ts` — while
   relational *includes* (an Order's `customer`, an OrderItem's `product`) must
   **not** filter by `deletedAt`, so a trashed Customer/Product still resolves
   correctly when displayed from an Order that references it.
3. `DELETE /customers/:id`, `/orders/:id`, `/products/:id`, `/users/:id` (trash);
   employee delete's reassignment-required check and UI.
4. Trash endpoints: list (filterable by type), restore, permanent-delete.
5. `trashService.purgeExpired()` + the `setInterval` scheduler.
6. `AuditLog` entries written for Delete/Restore/Permanent Delete.
7. Frontend: Trash page (tabs, table, Restore/Permanent Delete actions, the typed
   `DELETE` confirmation), sidebar Trash link + badge count, Delete buttons/
   confirmations added to Customer/Product/Order/Employee detail & list pages.

## Explicitly not doing

- No literal `DELETE FROM` for Customer/Order/Employee (per the finding above,
  resolved by anonymize-in-place).
- No bulk permanent-delete — every permanent delete is one record, typed
  confirmation, matching the spec's own emphasis that this stays a deliberate,
  effortful action.
- No Trash access for Manager/Employee in this build, per the spec's own explicit
  "unless you explicitly give it later."
- No dedicated Audit Log *viewing* page — entries are written for every Delete/
  Restore/Permanent Delete (`AuditLog`, reused as-is), satisfying the actual "record
  it" requirement, but the spec's own mockup shows the audit log as evidence of what
  gets recorded, not as a new page in the sidebar mockup (only Trash is listed
  there). Worth a real page whenever there's an actual need to browse the history,
  not speculatively built now.

## Built and verified (2026-08-21)

**Backend**: migration `20260821130000_trash_recycle_bin` (`deletedAt`/`deletedById`/
`deletionExpiresAt` on all four models, plus `purgedAt` on `User`/`Customer`/`Order`
— not `Product`, which has no post-purge row to mark) and
`20260821130500_backfill_order_delete_permission` (every existing Manager backfilled
with `order:delete`, same reasoning as the two Phase 15 addendum backfills — it's a
brand new permission, and routes gate on it immediately). New `utils/trash.ts`
(10-day expiry helper), `repositories/auditLog.repository.ts`, and a
`trashService` aggregating all four entities for the Trash page listing and the
purge sweep. Every repository's list/lookup functions now exclude trashed rows by
default (`customer.repository.ts`, `order.repository.ts`, `product.repository.ts`,
`user.repository.ts`) while relational includes (an Order's `customer`, an
OrderItem's `product`) are untouched, confirmed live: a trashed Customer's name and
full contact info still resolve correctly from an Order that references them.
`userRepository.findById` (used by `authenticate.ts` on every request) excluding
trashed rows means trashing an Employee/Manager locks them out immediately, same as
suspending — confirmed live.

**A real bug found and fixed during live testing**: a trashed employee could still
*log in* — `authService.login()` looks up the user via `findByEmail` (deliberately
not deletedAt-filtered, so signup/login can both still see the email is taken), then
only checked `status`, never `deletedAt`. Since deletion is orthogonal to status by
design, an ACTIVE-but-trashed employee sailed straight through. Fixed with an
explicit `deletedAt` check in `login()`; re-verified the exact same login attempt is
now correctly blocked.

**Employee/Manager delete's reassignment-required flow**, live-verified exactly as
specced: an Employee with 1 assigned customer and 0 active orders was blocked from
deletion with the precise counts in the error message, then succeeded once a
replacement Employee was supplied, with the customer's `assignedEmployeeId`
confirmed reassigned. Same pattern verified for a Manager with a reporting Employee
(blocked → reassigned to another Manager → succeeded). Admin accounts confirmed
un-deletable (`400`) regardless of who's asking.

**Full lifecycle live-verified end to end**: delete → Trash listing shows it with
correct deletedBy/deletedAt/deletionExpiresAt → restore → back to normal, fully
functional. Delete → Permanent Delete blocked without the typed `DELETE`
confirmation (and blocked with a wrong value) → succeeds with the correct one →
Customer's name became `"Deleted Customer #<id>"`, email nulled, and the
already-placed Order for that customer still resolved the (now-anonymized) customer
correctly. The purge scheduler's actual sweep logic was verified by backdating a
trashed record's `deletionExpiresAt` into the past and calling
`trashService.purgeExpired()` directly — it found the record, anonymized it,
set `purgedAt`, and logged the action, exactly matching what the hourly
`setInterval` will do automatically.

**Frontend**: `Sidebar.tsx` gained a Trash link (Admin-only) with a live badge count
(polled every 60s); `Trash.tsx` (tabs, table, Restore via the existing shared
`ConfirmDialog`, Permanent Delete via a new typed-`DELETE`-confirmation dialog);
`RequireRole roles={['ADMIN']}` guards `/trash`. Delete buttons added to
`CustomerDetail.tsx`/`ProductDetail.tsx`/`OrderDetail.tsx` (permission-gated,
reusing `customer:delete`/`product:deactivate`/`order:delete`) and a new
`DeleteEmployeeDialog` in `Employees.tsx` (Admin-only) that fetches the delete-impact
preview on open and conditionally shows either a plain confirmation or the
reassignment picker, matching the spec's "Amit Kumar currently has: 25 assigned
customers, 12 active orders" mockup precisely.

Backend and frontend `tsc`/`eslint`/`vite build` all clean throughout (0 errors;
frontend's only warnings are the same 6 pre-existing `react-hooks/incompatible-
library` instances already present elsewhere in this app). All throwaway test data
(customers, orders, employees, managers) left in Trash rather than hard-deleted or
force-purged, matching this session's established cleanup convention — it'll
auto-purge on its own 10-day schedule.
