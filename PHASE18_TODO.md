# Phase 18 — Multi-Employee Orders, Multi-Manager Employees, Activity Bug

Three separate items from one user message. Documented together since they arrived
together, but implemented and verified sequentially — each is its own real feature,
not a small tweak.

## 1. "Employee cannot see customer activity/assignment"

**Status: Investigated, not fixed — no bug found.**

Tested exhaustively before writing this doc:
- Jitender Rajput's exact real account (real permissions, real data scope) against
  a real customer assigned to him — both locally and against production (Render).
  `GET /customers/:id` and `GET /customers/:id/activity` both returned fully correct
  data (`assignedEmployee`, `assignedManager`, activity log entries) every time.
- A brand-new, fully standard employee (default permissions, real password login,
  no special testing tricks) — also fully correct.

The backend is proven correct in every reproducible scenario. Most likely
explanation: a stale cached frontend build in the browser (many deploys happened
this session). Waiting on the user to hard-refresh and report back, or provide a
screenshot / exact wording if it's still broken after that — no code changes to make
until there's something concrete to fix.

## 2. Multi-employee order assignment (shared visibility)

**Status: Done.**

Confirmed requirements:
- `Order.assignedEmployeeId` (single FK) becomes many-to-many — several employees
  can all see and work the same order, not just be informed about it.
- Create Order form gets a new multi-select "Assign to Employee(s)" field, visible
  only to Admin/Manager.
  - Admin/Manager creating the order: defaults to **Jitender Rajput** pre-selected,
    removable; other employees can be added alongside or instead.
  - Employee creating the order: no default assignee at all — the order simply has
    no employees assigned yet, and becomes visible to Admin/Manager (already true
    today via the *customer's* assignedManagerId chain) so they can assign it
    afterward.

### Plan
- **Schema**: new `OrderAssignedEmployee` join table (`orderId`, `employeeId`,
  `assignedAt`, unique on the pair), replacing `Order.assignedEmployeeId`/
  `assignedEmployee` entirely — a hybrid single-FK-plus-join-table would be
  confusing. Migration backfills existing single assignments into the join table
  before dropping the old column.
- **Backend**:
  - `order.schema.ts`: `assignedEmployeeId?: number` → `assignedEmployeeIds?: number[]`
    on create/update.
  - `order.repository.ts`: create/update write to the join table; every `findById`/
    `findByOrderNumber`/`findMany` swaps the `assignedEmployee` include for
    `assignedEmployees: { include: { employee: {...} } }`.
  - `dataScope.ts`: `orderDataWhere`/`hasOrderDataAccess` extended — an Employee can
    see an order if EITHER they're assigned to the order's customer (existing rule)
    OR they're one of the order's assigned employees (new rule). This is the part
    that actually delivers "shared visibility," not just a display change.
  - `user.service.ts`'s `getDeleteImpact`/`delete` (employee deletion + reassignment)
    updated to work against the join table instead of a scalar column.
  - `dashboard.service.ts`'s `employeeId` report filter updated similarly.
  - No backend special-casing of "Jitender Rajput" by name — the default is a
    frontend form behavior (pre-checking his checkbox), not a server-side rule.
- **Frontend**:
  - `CreateOrder.tsx`: new multi-select employee field (Admin/Manager only),
    pre-selecting Jitender Rajput by matching his name in the fetched employee list.
  - `OrderDetail.tsx`/`Orders.tsx`/`Home.tsx`: "Assigned Employee" (singular) display
    and edit UI become multi-value (badge list + multi-select editor). (Orders.tsx and
    Home.tsx turned out not to reference assignedEmployee at all — nothing to change
    there; only CreateOrder.tsx and OrderDetail.tsx needed edits.)

### Built as planned, plus one bug found and fixed along the way

Implemented exactly per the plan above: `OrderAssignedEmployee` join table (migration
backfills the old scalar column, then drops it), `order.schema.ts`/`order.repository.ts`/
`order.service.ts` reworked for the array, `dataScope.ts`'s `orderDataWhere`/
`hasOrderDataAccess` extended for shared visibility, `user.service.ts`'s delete-impact/
reassignment and `dashboard.service.ts`'s employeeId filter updated for the join table,
`CreateOrder.tsx` gets the new Admin/Manager-only multi-select (via a new shared
`EmployeeMultiSelect` component, reused by `OrderDetail.tsx`'s edit UI too) defaulting to
Jitender Rajput by name match.

Live-tested end-to-end against the local dev server with disposable test data (a test
customer, two disposable test employees, one order assigned to both) before writing this:
multi-employee assignment on create, shared visibility for an assigned-but-not-customer-
owning Employee (200/list-visible), correct 403/empty-list for an uninvolved Employee,
full-replacement semantics + activity log on update, and the employee-delete
reassignment path carrying the join-table row over to the replacement employee. All
test data fully purged via Trash afterward.

**Bug found and fixed during this verification** (not present before this feature):
`buildOrderWhere` in `order.service.ts` spreads `orderDataWhere`'s result and, separately,
a search-term filter — both of which can now produce a top-level `OR` key (an Employee's
scope is itself `OR`-shaped after this change). Spreading two objects that each have an
`OR` key means the second one silently *replaces* the first, so any Employee search
request was dropping their own data-scope filter entirely and searching company-wide.
Fixed by combining every filter piece into a single `AND: [...]` array instead of one
spread object, so scope's `OR` and search's `OR` can never collide. Confirmed live: an
uninvolved Employee's search for the test order now correctly returns empty (was
returning the order before the fix).

## 3. One employee can work under multiple managers

**Status: Not started — biggest, highest-risk item.**

Confirmed scenario: an employee's customers/orders can be split across more than
one manager's team simultaneously.

**Verified this is a real structural gap, not just a display issue**: tried to find
a lighter fix (since `Customer.assignedManagerId` is already independently settable
per-customer, decoupled from the employee's own `User.managerId`) — but
`customer.service.ts`'s `resolveEmployeeAssignment` explicitly blocks a Manager from
assigning a customer to an employee whose `managerId` isn't literally that Manager's
own ID (`403 "You can only assign customers to your own team"`). The single
`User.managerId` FK is a real, enforced constraint, not just an incomplete list
query.

### Plan
- **Schema**: new `EmployeeManager` join table (`employeeId`, `managerId`, unique on
  the pair), replacing `User.managerId` as the source of "which manager(s) does this
  employee belong to." Migration backfills every existing `managerId` value into the
  join table before dropping the column.
- **Backend** (every one of these currently keys off the single `managerId`):
  - `customer.service.ts`'s `resolveEmployeeAssignment` — check join-table
    membership instead of equality.
  - `order.service.ts`'s equivalent employee-assignment resolution.
  - `user.service.ts`'s `list()` (a Manager's Employees list) — anyone with a
    join-table row pointing to that Manager, not `WHERE managerId = me`.
  - `assertManagesUser` — same membership check, for permission-editing/suspend/
    delete authority over an Employee.
  - `user.service.ts`'s `create()` — creating a new Employee under a Manager writes
    one join-table row instead of setting a scalar field. Adding an *existing*
    Employee to an *additional* Manager's team becomes a new, separate action.
  - `user.service.ts`'s `getDeleteImpact`/`delete` (deleting a Manager, reassigning
    their reports) — updated for the join table.
  - **Open design question, not yet resolved**: when an Employee with multiple
    managers creates a customer/order themselves, today it auto-assigns to
    `actingUser.managerId` — with multiple managers that's ambiguous. Needs a
    decision (ask the employee which team it belongs to at creation time? default to
    whichever manager they were added to first?) before this part can be built.
- **Frontend**: Employees page — "Manager: X" (singular) becomes a list; needs an
  Admin-facing way to add/remove an Employee from a Manager's team as a distinct
  action from creating the Employee in the first place.

## Sequencing

Implementing in this order, verifying each thoroughly (live, both directions of the
data-scope logic) before moving to the next:
1. Item 2 (multi-employee order assignment) — fully clarified, moderate scope.
2. Item 3 (multi-manager employees) — largest, most invasive; the open design
   question above needs an answer before the Employee-creates-own-customer part can
   be finished.
3. Item 1 stays parked until there's a concrete repro to act on.
