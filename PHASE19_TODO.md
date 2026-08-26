# Phase 19 — Order-Wide Customer Search, Multi-Employee Customer Assignment,
# Automatic Customer Status

One user message, four intertwined features. Documented together (they share a lot
of plumbing — the "active order" concept in particular is the load-bearing idea
behind three of the four), implemented and verified in dependency order.

## Design decisions made while turning this into a plan

The spec was very thorough, but a few points needed a concrete resolution before
writing code. Flagging these clearly since they're real judgment calls, not just
transcription:

1. **"Active order" is the single concept every automatic-status/assignment rule
   depends on — precisely defined here, once.** Naively reusing Phase 17's
   `DELIVERY_TERMINAL_STATUSES` (`DELIVERED`/`RETURNED`/`LOST`/`DAMAGED`) is *almost*
   right but misses one case: an order cancelled **before** dispatch
   (`orderService.cancel`'s immediate-restore path) sets `orderStatus = CANCELLED`
   but leaves `deliveryStatus` at `NOT_DISPATCHED` forever — it never enters the
   return flow, since nothing was ever shipped. `NOT_DISPATCHED` isn't a terminal
   delivery status, so a naive check would count this order as "active" forever.
   Correct definition, added as one shared helper so customer-status and
   assignment-removal can never drift apart:
   ```
   isOrderActive(order) =
     NOT (order.deliveryStatus in {DELIVERED, RETURNED, LOST, DAMAGED})
     AND NOT (order.orderStatus === CANCELLED AND order.deliveryStatus === NOT_DISPATCHED)
   ```
   Every example in the spec checks out against this: new order → active; dispatched/
   in-transit/out-for-delivery → active; delivered → done; cancelled pre-dispatch →
   done (the correction above); cancelled post-dispatch, return pending/in-transit →
   active; cancelled post-dispatch, returned → done. Lost/Damaged are treated as done
   too (not explicitly covered by the spec, but they're already modeled as terminal
   everywhere else in the app — no reasonable alternative).

2. **Order creation's existing "customer must be ACTIVE" gate is being removed.**
   `order.service.ts`'s `create()` currently throws 400 *"Cannot create an order for
   an inactive customer"*, and the frontend's Deactivate dialog literally advertises
   this ("Deactivated customers can't be used for new orders until reactivated").
   This directly contradicts the new spec's own testing checklist — *"Create an order
   for an inactive customer → customer automatically becomes Active"* is an explicit,
   required test case. Since status is becoming a pure computed reflection of order
   history rather than a manually-curated flag, keeping the gate would make
   reactivation-via-new-order structurally impossible. Removing the gate; "customer
   exists and isn't trashed" is still checked, same as every other module.

3. **Manual status control is removed, not just superseded.** *"Customer status must
   be updated by the backend, not manually by the employee"* — the existing `PATCH
   /customers/:id/status` route (and its `customer:delete`-gated Deactivate/Reactivate
   buttons on Customer Detail) is a real, currently-used capability. Removing it
   entirely rather than leaving a dead/overridable control, since the spec is
   unconditional and a manual override would just get silently clobbered by the next
   automatic recompute anyway.

4. **Automatic assignment tracks the order's *creator* (`createdById`), not Phase
   18's `Order.assignedEmployees`.** The spec's language throughout ("when an
   employee successfully creates an order... assign that customer to the employee",
   "check whether *that employee* has any other active orders") is about the person
   who created the order, not who an Admin/Manager later staffed onto it via Phase
   18's multi-employee order assignment — a separate, manually-curated concept this
   feature deliberately doesn't touch. "Employee X has an active order for customer
   Y" means `Order.createdById = X AND Order.customerId = Y AND isOrderActive(order)`.

5. **Auto-assignment-on-create only fires for an `EMPLOYEE` actor**, not Admin/
   Manager creating an order on a customer's behalf — the feature is about "which
   Employee is doing the work for this customer," which doesn't apply when the
   creator isn't an Employee.

6. **Auto-removal only ever touches assignment rows tied to the departing
   Employee's own order history for that customer** — i.e. only Employees who appear
   as `createdById` on at least one of that customer's orders are candidates for
   removal at all. An Employee manually assigned by an Admin/Manager who has never
   personally created an order for that customer is never touched by this recompute,
   regardless of what happens to anyone else's orders.

7. **New permission names use the codebase's existing `module:action` convention**
   (`customer:create`, `order:update`, …), not the spec's literal
   `orders.customer_search_all` dotted style. Two new permissions:
   - `order:customerSearchAll` — the new order-creation-time broad customer search.
   - `customer:assign` — manual assign/reassign/unassign/bulk-assign, split out of
     `customer:update` (which today ungates them, and which every Employee gets by
     default — exactly what the spec says shouldn't be true by default anymore).
   Neither is in `DEFAULT_EMPLOYEE_PERMISSIONS`; both are in
   `DEFAULT_MANAGER_PERMISSIONS`/`FULL_ACCESS` like every other business permission.
   **`customers.view_all` / `customers.view_assigned` are *not* new permissions** —
   that distinction already exists as the Customers module's Data Scope (`ALL` vs
   `ASSIGNED`), which stays completely untouched; the spec's "don't grant
   customers.view_all because of this" requirement is satisfied by the new search
   path being entirely independent code, not by inventing a parallel permission for
   something already modeled.

8. **The new customer search is one new endpoint, not two.** `GET
   /customers/search-for-order` — gated on `order:create` (must be able to create
   orders to use it at all). Internally: if the caller has `order:customerSearchAll`,
   search every active-status-irrelevant, non-trashed customer; otherwise, fall back
   to their existing `customerDataWhere` scope (identical to what they already see on
   the Customers page). Either way the **response shape is always the limited one**
   (name, phone, city, currently-assigned employees) — never the full profile, even
   for a Manager who could technically see everything via the regular endpoint. One
   code path, one shape, easy to reason about and to test.
   **Not filtered by `customer.status`** — an Inactive customer must stay findable
   here, otherwise decision #2 above (reactivating via a new order) would be
   unreachable through the UI that's supposed to enable it.

## A. Customer search for order creation

- [ ] New permission `order:customerSearchAll` (schemas/permission.schema.ts +
      frontend lib/permissions.ts's Orders module) — not in
      `DEFAULT_EMPLOYEE_PERMISSIONS`.
- [ ] New route `GET /customers/search-for-order?search=` — `order:create`-gated,
      `customerRepository`/`customerService` gets a new `searchForOrder()` pair.
      Returns `{ id, name, phones: [{phone, isPrimary}], addresses[0].city,
      assignedEmployees: [{id, name}] }` shaped rows only.
- [ ] `CustomerPicker.tsx` (used by Create Order) switches from `/customers?search=`
      to `/customers/search-for-order?search=`.
- [ ] Customers page (`Customers.tsx`) keeps using `/customers?search=` unchanged —
      still gated purely by `customer:view` + Data Scope, no behavior change.

## B. Customer ↔ Employee assignment: single → multiple

- [ ] Schema: new `CustomerAssignedEmployee` join table (`customerId`, `employeeId`,
      `assignedAt`, unique on the pair) — same shape as Phase 18's
      `OrderAssignedEmployee`. Migration backfills every existing
      `Customer.assignedEmployeeId` into the join table before dropping the column.
- [ ] `customerDataWhere` / `hasCustomerDataAccess` (Employee branch): membership in
      the join table instead of scalar equality. Manager branch's join-table fallback
      (Phase 18 item 3 — "any of this customer's assigned employees reports to me")
      updated to check *any* assigned employee, not a single one.
- [ ] `resolveEmployeeAssignment`, `assign`/`reassign`/`unassign`/`bulkAssign`
      (customer.service.ts): assign/bulkAssign add a row (no-op if it already exists,
      per the "prevent duplicate assignment" requirement); reassign becomes "assign
      another employee alongside the existing ones" (there's no single slot to swap
      anymore) — kept as a distinct endpoint/wording for now since the frontend still
      calls it that way, but behaviorally identical to assign now that it's additive,
      not exclusive; unassign removes one specific employee's row (needs an
      `employeeId` now, not just a customer id).
- [ ] Gate assign/reassign/unassign/bulk-assign behind the new `customer:assign`
      permission instead of `customer:update` (see design note 7).
- [ ] `user.service.ts`'s `getDeleteImpact`/`delete()` (deleting an Employee) —
      reworked for the join table, same pattern as Phase 18's `OrderAssignedEmployee`
      reassignment.
- [ ] **Auto-assign on order creation**: `orderService.create()`, after creating the
      order, if `actingUser.role === 'EMPLOYEE'`, upsert a
      `CustomerAssignedEmployee(customerId, actingUser.id)` row (idempotent — no
      duplicate if already assigned).
- [ ] **Auto-removal on order completion**: shared `recalculateCustomerState(customerId,
      tx)` helper (see part C) removes an Employee's `CustomerAssignedEmployee` row
      once none of their created orders for that customer are still active, called
      from every place an order's active/done state can change for that customer.
- [ ] Frontend: `CustomerDetail.tsx`, `Customers.tsx`, and Employees.tsx's
      `CustomerAssignmentTable` become multi-value (reusing the `EmployeeMultiSelect`
      component built for Phase 18's Order assignment).

## C. Customer status: manual → fully derived

- [ ] Remove `PATCH /customers/:id/status`, `customerService.updateStatus`,
      `updateStatusSchema`, and the Deactivate/Reactivate buttons on Customer Detail
      (design note 3).
- [ ] Remove order creation's "customer must be ACTIVE" gate (design note 2).
- [ ] New shared helper (`backend/src/lib/orderMetrics.ts` or a new
      `customerAutomation.ts`) exporting `isOrderActive(order)` (design note 1) and
      `recalculateCustomerState(customerId, tx)`:
      - Recomputes `Customer.status` from scratch: `ACTIVE` if any non-trashed order
        for that customer is active, else `INACTIVE`.
      - For every distinct `createdById` among that customer's orders (design note
        6), removes their `CustomerAssignedEmployee` row if none of their orders for
        this customer are active anymore.
      - Idempotent, full-recompute (not incremental) — self-heals rather than
        drifting, matters for the "edge cases" section (concurrent updates, failed
        transactions) at the bottom of the spec.
- [ ] Call sites: `orderService.create()` (new order → recompute, will flip to
      ACTIVE), `orderService.updateDeliveryStatus()` (every change — matters most for
      reaching `DELIVERED`/`RETURNED`), `orderService.cancel()`'s immediate-restore
      branch (the `NOT_DISPATCHED` case from design note 1 — `updateDeliveryStatus`
      is never called on this path, so it needs its own call). All three already run
      inside a `$transaction`, so `recalculateCustomerState` takes the same `tx`.

## D. Permissions summary

| Permission | Default Employee | Default Manager / Full Access |
|---|---|---|
| `order:customerSearchAll` (new) | No | Yes |
| `customer:assign` (new, replaces assign/reassign/unassign/bulk-assign's old ride on `customer:update`) | No | Yes |
| `customer:view` / Data Scope (`ALL` vs `ASSIGNED`) | unchanged | unchanged |
| `order:create` | unchanged | unchanged |

## Sequencing

1. Schema: `CustomerAssignedEmployee` table + migration (backfill, drop scalar
   column). Regenerate client.
2. Backend core: `isOrderActive`/`recalculateCustomerState`, `dataScope.ts` updates,
   `customer.repository.ts`/`customer.service.ts` rework, new permissions, new
   search endpoint, order-service call sites (create/updateDeliveryStatus/cancel),
   remove the manual-status route and the order-creation ACTIVE gate.
3. Frontend: `CustomerPicker.tsx` (new search endpoint), multi-employee assignment UI
   on Customer Detail / Customers / Employees, remove Deactivate/Reactivate UI,
   permission picker gets the two new checkboxes.
4. Live verification against the checklist below (disposable test data, purged via
   Trash afterward, matching this project's established pattern) before committing.

## Testing checklist (from the spec, kept verbatim as the acceptance list)

### Customer status
- [ ] New customer with no orders → Inactive.
- [ ] Create an order for an inactive customer → customer automatically becomes Active.
- [ ] Create another order for an already active customer → remains Active.
- [ ] Customer with one/multiple active orders → Active.
- [ ] Deliver the only active order → customer becomes Inactive.
- [ ] Deliver one order while another is still active → customer remains Active.
- [ ] Complete all active orders → customer becomes Inactive.
- [ ] Cancel pre-dispatch → customer status recalculated correctly (Inactive if that
      was the only order).
- [ ] Cancel post-dispatch, not yet returned → customer remains Active.
- [ ] Cancelled + returned, no other active orders → Inactive.
- [ ] Cancelled + returned, another active order exists → remains Active.
- [ ] After becoming inactive, a new order → Active again.

### Employee assignment
- [ ] Employee creates an order for an unassigned customer → auto-assigned.
- [ ] Employee creates another order for the same customer → no duplicate assignment.
- [ ] Customer assigned to multiple employees at once.
- [ ] Employee B orders for a customer already assigned to Employee A → B added, A
      untouched.
- [ ] Employee A's order delivered while B still has an active order → A removed, B
      remains.
- [ ] Employee A has multiple active orders → delivering one doesn't remove A.
- [ ] Employee A's last active order completes → A removed.
- [ ] Cancelled + return pending → assignment remains.
- [ ] Cancelled + returned, no other active order → assignment removed.
- [ ] Cancelled + returned, another active order exists → assignment remains.

### Customer search
- [ ] Employee can search all active customers while creating an order (with the new
      permission).
- [ ] Employee can search a customer not assigned to them / assigned to someone else.
- [ ] Employee can find and select an Inactive customer, and creating the order makes
      them Active.
- [ ] Search response never includes notes/order history/full profile.
- [ ] Search can't be used to bypass normal Customers-page permissions (no
      `customer:view`/Data Scope escalation).

### Permissions & security
- [ ] `order:create` + `order:customerSearchAll` → search-all works.
- [ ] `order:create` without `order:customerSearchAll` → falls back to normal scope.
- [ ] No `order:create` → search endpoint itself is forbidden.
- [ ] No `customer:assign` → manual assign/reassign/unassign/bulk-assign forbidden.
- [ ] Every above check re-verified directly against the API (not just hidden UI).

### Order status / return
- [ ] Dispatched → Confirmed, Transit → Processing, Out for Delivery → Out for
      Delivery, Delivered → Delivered (Phase 17, unchanged — regression check only).
- [ ] Cancelled + return pending → customer stays Active.
- [ ] Cancelled + returned → recalculated correctly.

### Multiple orders / edge cases
- [ ] 3 active orders → Active; completing them one at a time stays Active until the
      last one, then Inactive; a new order after that → Active again.
- [ ] Order-creation failure never leaves a stray Active flip or assignment row
      (recompute only runs after a successful transaction commit).
- [ ] Customer with only historical completed / only cancelled-and-returned orders →
      Inactive.
- [ ] Customer with one cancelled-return-pending order → Active.
