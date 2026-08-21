# Phase 15 — New User Signup & Approval Workflow

## Status: done (2026-08-21)

Spec pasted 2026-08-21 across two messages (signup/approval flow, then a follow-up on
suspend/reactivate). Checked against the actual current code before writing this,
same as every prior phase — several pieces of this turned out to already exist.

## Already satisfied — verified via this audit, no new work

- **Suspend/reactivate already re-checks status on every request, not just at
  login.** `authenticate.ts` re-fetches the user from the DB on every single request
  and rejects anything `!== 'ACTIVE'` — a status change takes effect on the *next*
  request, with no separate token-invalidation step needed. This already satisfies
  the spec's "don't rely only on the frontend / session should become invalid"
  requirement, for any status value, not just ones that exist yet.
- **"A Manager can't suspend another Manager or Admin" already holds structurally.**
  `userService.assertManagesUser` lets a Manager act only on a user whose
  `managerId === actingUser.id` — by construction that's only ever their own
  Employees, never another Manager (`managerId: null`) or an Admin. No new
  restriction to add here, just confirming it during the design of the new
  suspend/reactivate endpoints.
- **`AccountStatus` already has `SUSPENDED`** in the schema (added at some earlier
  point, never wired to any UI/logic). Reused rather than re-added.
- **The permission system Employee approval needs already exists in full** —
  `PATCH /users/:id/permissions`, `PERMISSIONS` list, the existing Employees.tsx
  permission-group checkboxes. Approval reuses this, doesn't rebuild it.

## Real gaps / new work

1. **No public signup exists at all.** Every account today is created *by* an Admin
   or Manager via `POST /users` (`requireRole('ADMIN', 'MANAGER')`). Needs a new
   public `POST /auth/signup` endpoint plus a `/signup` frontend page.
2. **`User.role` is `Role @default(EMPLOYEE)` — not nullable.** A signed-up-but-not-
   yet-approved user needs `role = null`. This is the widest-blast-radius single
   change in this phase: `Role` is referenced as a non-null type in ~13 backend files
   (mostly `ActingUser`-shaped type aliases and `req.user.role` — all via simple
   equality checks that are already null-safe, e.g. `role === 'MANAGER'`, just typed
   too narrowly today). Widening the type, not touching the comparison logic.
3. **`authenticate.ts` currently hard-rejects anything other than `ACTIVE`,
   including a would-be `PENDING` user** — but the spec explicitly wants a pending
   user to be able to log in and see "waiting for approval." `authenticate` needs to
   accept `ACTIVE` *or* `PENDING`; every individual protected route (already
   `authorize(...)`/`requireRole(...)`-gated everywhere) naturally continues to
   reject a `PENDING`/null-role user from real data, since `authorize` falls through
   to a permission check (empty for a pending user) and `requireRole` checks against
   an explicit role list that a `null` role never matches.
4. **No `phone` field on `User` today** — Customer has a whole multi-phone/label/
   primary system; User needs just one plain required string field, nothing that
   elaborate.
5. **No `requestedRole` field** — new nullable enum (`MANAGER` | `EMPLOYEE` only,
   never `ADMIN`), captured at signup as a hint, never authoritative.
6. **No record of who approved/rejected/suspended/reactivated an account, or when**
   — every other status-changing action in this app records an actor + timestamp
   (`Order.cancelledById`/`cancelledAt`, `Payment.createdById`, etc.). Adding the
   same for User: `reviewedById`/`reviewedAt` (set by both approve and reject — one
   "who last decided this account's fate" field, not two), and
   `suspendedById`/`suspendedAt` (set on suspend, cleared back to null on
   reactivation, so it always reflects the *current* suspension if any, not a full
   history).
7. **Admin review queue + user-detail approve/reject panel** — new frontend, folded
   into the existing Employees page (`Users` today) rather than a separate page,
   since it's the same underlying `/users` list just filtered to `status = PENDING`.
8. **Reject action** — no existing equivalent (Employees.tsx today only has
   Deactivate/Activate). See open question #2 below for what it actually does.

## Decisions

1. **Manager permissions are configurable** (not just full-access). This is the
   deep architecture change flagged in the questions — `authorize()` no longer
   auto-bypasses for `MANAGER`, only `ADMIN` does; `MANAGER` is now checked against
   real permission grants exactly like `EMPLOYEE`. Concrete scoping decision made to
   keep this bounded rather than an exhaustive rewrite of every `requireRole` gate
   in the app:
   - **Converted to `authorize()`, now Manager-configurable**: `product:create`/
     `product:update` (new permissions — product create/update was `requireRole`-
     only before, no permission existed for it), `report:view` (new permission —
     the whole Reports router was `requireRole`-only before), and the Customer
     assignment/deactivate endpoints (`bulk-assign`, `/:id/status`, `/:id/assign`,
     `/:id/reassign`, `/:id/unassign`) now ride on the existing `customer:update`
     permission rather than a blanket role check.
   - **Left as `requireRole('ADMIN','MANAGER')`, unchanged, NOT permission-gated**:
     Category management, and Employee/User management itself (creating/editing
     other users, granting permissions). Neither appears in the pasted mockup's
     Manager checklist (Customers/Products/Orders/Reports only), and folding
     Employee management into the permission system would let a Manager grant
     themselves or another Manager elevated access — a real privilege-escalation
     concern, not just scope discipline.
   - **Backward compatibility**: every existing `MANAGER` account had zero
     `UserPermission` rows (never needed them under the old blanket-bypass rule).
     The migration backfills the full permission list for every existing Manager,
     so shipping this doesn't silently lock out anyone already active. Newly
     approved Managers get whatever the Admin picks at approval time — no
     grandfathered default.
2. **Reject keeps the record** — new `REJECTED` status, blocked from login exactly
   like `SUSPENDED`, kept out of every normal list (filterable back in for an audit
   view later if ever needed). No user record in this app is ever hard-deleted.
3. **`SUSPENDED` and `INACTIVE` stay two distinct statuses.** Employees.tsx keeps
   its existing Deactivate/Activate button (→ `INACTIVE`) exactly as it is today,
   unchanged, and gains a second, separate "Suspend Access"/"Reactivate" button (→
   `SUSPENDED`) alongside it for currently-`ACTIVE` rows — matching the pasted
   mockup's explicit `[Suspend Access]` button. Both statuses block login/API access
   identically (`authenticate.ts` rejects anything other than `ACTIVE`/`PENDING`);
   the distinction is purely which action produced it.

## Explicitly not doing

- No email delivery for the "your account was approved/rejected" notification —
  matches this app's existing password-reset behavior (Phase 3: logs the token/
  event instead of sending real email, no mail infrastructure yet). The frontend
  shows the pending/approved state on next login instead.
- No CAPTCHA on `/signup` — reusing the existing `loginRateLimiter` middleware
  pattern is enough for this app's scale, consistent with how `/login` is already
  protected.
- No org/invite-code gate on signup — this is a single small business's internal
  tool; the real security boundary is Admin approval, not who can reach the signup
  URL.
- No `CustomerAssignment` many-to-many table — the pasted spec itself says
  `Customer.assignedEmployeeId` (already exists, built in Phase 3/11) is enough for
  this app's size; not revisiting that decision here.

## Addendum backend: done and live-verified (2026-08-21)

Second migration (`20260821110000_data_scope_and_split_permissions` +
`20260821111500_backfill_split_permissions`, the latter backfilling `customer:delete`/
`product:deactivate` onto every existing Manager so moving the deactivate routes onto
them didn't silently regress anyone already active). New shared `utils/dataScope.ts`
(`customerDataWhere`/`orderDataWhere`/`hasCustomerDataAccess`/`hasOrderDataAccess`) —
the one place "which records can this user see" lives, used by
`buildCustomerWhere`/`buildOrderWhere`, `dashboard.service.ts`'s scope functions, and
`checkCustomerAccess`/`checkOrderAccess`. `customer:delete`/`product:deactivate`
permissions added and the deactivate/reactivate routes moved onto them (assignment
endpoints stay on `customer:update`, per the decision). `employee:manage-permissions`
added and gating `PUT /users/:id/permissions` for Manager actors (`assertCanEditPermissions`
in `permission.service.ts`) — Admin always bypasses, viewing (`GET`) stays open to any
Manager for their own Employees unchanged. `approve()` and the permission-update
endpoint both accept optional `customerDataScope`/`orderDataScope` now.

**A real bug found and fixed during live testing**: `userService.approve()` returned
the stale pre-dataScope-update user object when both `permissions` and a data scope
were submitted together (two separate DB writes, but the response was built from the
first one's result) — the API call succeeded but the response showed
`customerDataScope: null` even though it was actually saved correctly. Fixed by
capturing the second update's return value.

**Live-verified end to end**, cleanup done afterward: signup → PENDING/role=null;
`PENDING` login succeeds but `GET /customers` 403s and global search returns empty
across every group; Admin's pending queue (`GET /users?status=PENDING`); approve as
Employee with `customerDataScope=ASSIGNED`/`orderDataScope=ALL` → that Employee
correctly sees zero customers but every company order; suspend → immediate 401 on
the very next request with no re-login involved; reactivate → works again
immediately; reject → blocked from login with the existing "not active" message;
a fresh Admin-created Manager gets the full permission set minus
`employee:manage-permissions`; a Manager without that grant gets a clear 403 editing
an Employee's permissions, and the exact same request succeeds immediately after an
Admin grants it — no re-login needed there either, confirming the request-time
re-check pattern applies to permission grants, not just account status.

## Backend progress so far (mid-build, before the Data Scope addendum below)

Applied and live: migration `20260821090000_user_signup_approval_workflow`
(`AccountStatus` +`PENDING`/`REJECTED`; `User.role` nullable; new `phone`/
`requestedRole`/`reviewedById`/`reviewedAt`/`suspendedById`/`suspendedAt` columns;
every existing Manager backfilled with the full flat permission list). `Role`
widened to `Role | null` everywhere it's referenced (~13 files, all null-safe
equality checks, no logic changes). `authorize()` middleware no longer bypasses for
`MANAGER`, only `ADMIN`. New shared `utils/permissions.ts` `hasPermission()` helper
(single source of truth, used by `authorize()` and by services that need the same
check inline). `product:create`/`product:update`/`report:view` added to
`PERMISSIONS`; Products create/update and the whole Reports router converted from
`requireRole` to `authorize()`; Customer assignment/deactivate endpoints converted
to `authorize('customer:update')`. Global search's product/order/customer
sub-searches now explicitly check the matching `view` permission before querying —
closes a real pre-existing gap where `productService.list()` has no scoping at all
and would otherwise have handed real product data to a `PENDING` account via
Ctrl+K. Public `POST /auth/signup`, `authService.login()` allowing `PENDING`
through, `authenticate.ts` accepting `ACTIVE`/`PENDING`. New `userService`/
`userController`/routes: `approve`, `reject`, `suspend`, `reactivate`, plus
`list()` gaining a `status` filter for the pending queue. **Not yet touched**:
frontend (no Signup page, no pending-approval screen, no Admin review UI yet) —
this addendum changes the permission-editing UI enough that it wasn't worth
building against the old flat shape first.

## Addendum — Role + Permissions + Data Scope (2026-08-21, before any frontend was built)

A significant extension requested before the frontend work started: access becomes
three independent layers instead of two —

```
Role (administrative authority) + Permissions (View/Create/Edit/Delete per module)
+ Data Scope (All / Assigned per module)
```

— with presets (Standard Employee/Standard Manager/Full Access/Custom) to speed up
the common cases, and an explicit, named distinction that "Full Access" (business
permissions) is never the same thing as "Admin" (system authority). Full mockup and
reasoning recorded in `phases.md`'s Phase 15 "Addendum" section; this is the build
breakdown.

**Good news: the permission-list part is small.** Checking the exact module/action
grid against what already exists in `PERMISSIONS`:

| Module | Requested checkboxes | Already exists? |
|---|---|---|
| Customers | View/Create/Edit/**Delete** | View/Create/Edit exist; **Delete is new** (`customer:delete`) — today's assignment/deactivate endpoints use `customer:update`, will move to this new permission instead |
| Orders | View/Create/Edit/Cancel | All four already exist (`order:cancel` already there) |
| Products | View/Create/Edit/**Deactivate** | View/Create/Update exist; **Deactivate is new** (`product:deactivate`) — splits out from `product:update`, which currently also gates the status-toggle route |
| Delivery | Update | Already exists (`delivery:update`) |
| Payments | View/Edit | Already exist |
| Reports | View | Already exists (just added this session) |

So only two new permission strings: `customer:delete`, `product:deactivate`.

**The real new work is Data Scope.** Today, "Admin sees all / Manager sees their
team / Employee sees only their own" is *hard-coded by role* in three places
(`buildCustomerWhere`, `buildOrderWhere` in `order.service.ts`, and the matching
scope functions in `dashboard.service.ts`), plus enforced per-record in
`checkCustomerAccess`/`checkOrderAccess`. Making it configurable means:

1. New `DataScope` enum (`ALL`/`ASSIGNED`) and two new nullable `User` columns —
   `customerDataScope`, `orderDataScope`. Null means "use today's default"
   (Manager → their team is `ASSIGNED`-equivalent, Employee → their own is
   `ASSIGNED`; Admin is always `ALL`, never configurable) — so every existing
   account keeps its exact current behavior with no backfill needed, only newly
   approved/edited users get an explicit value.
   - **Products deliberately has no Data Scope** — per the request's own
     reasoning, products aren't per-employee, so there's nothing to scope beyond
     the `product:view` permission that already exists.
2. `buildCustomerWhere`/`buildOrderWhere`/`dashboard.service.ts`'s scope functions
   all change from a pure role branch to: Admin → `{}` always; else read
   `customerDataScope`/`orderDataScope` (defaulting to today's role-based
   behavior when unset) → `{}` (all) or the existing assigned-to-me/my-team filter.
3. `checkCustomerAccess`/`checkOrderAccess` (single-record access, not just list
   scope) need the same consultation — "All Data" should mean a user can open any
   individual customer/order too, not just see it in a list.

**A new delegated authority, not a business permission**: "a Manager can configure
their own Employees' permissions, if Admin grants that" — a new
`employee:manage-permissions`-style grant, checked on
`PUT /users/:id/permissions` for a `MANAGER` actor specifically (`ADMIN` always
bypasses). Deliberately not mixed into the same list as the business-data
checkboxes in the UI — it's about managing *other accounts*, which is
administrative-authority territory per the addendum's own stated principle, even
though the underlying mechanism (a grantable permission string) is the same one
already built.

**Presets are frontend-only** — `Standard Employee`/`Standard Manager`/
`Full Access`/`Custom` each just pre-fill the same checkboxes/radios the picker
already has; nothing new is stored, no backend concept needed. What's persisted is
always the resulting permissions + data scope, never which preset produced them.

### What's not changing from the already-decided plan above

- Approve/Reject/Suspend/Reactivate endpoints, statuses, and their authorization
  rules (Admin-only review, `assertManagesUser`-scoped suspend) are unaffected —
  the approve endpoint's body just grows two optional fields
  (`customerDataScope`/`orderDataScope`) alongside the `permissions[]` it already
  accepts.
- The Category/Employee-management `requireRole`-only scoping decision is
  unaffected, except that `employee:manage-permissions` now exists as one specific,
  narrow carve-out of "who can touch permissions," not a general loosening of
  Employee-management being role-gated.

## Frontend: built (2026-08-21)

Asked before building (separate from the backend design questions): Pending Approval
gets its **own section** on the Employees page, above the regular table, matching the
pasted mockup exactly (a pending account has no role yet, so it doesn't fit the
regular table's Role column). Presets **reuse the backend's own existing defaults**
(`DEFAULT_EMPLOYEE_PERMISSIONS`/`DEFAULT_MANAGER_PERMISSIONS` mirrored on the
frontend, kept in sync by comment) rather than inventing new curated lists. The
signup form's optional "I'm applying as" field was **left out** for this build — the
backend already accepts `requestedRole` so adding the two radio buttons later needs
no backend change.

Built: `/signup` page (Name/Phone/Email/Password/Confirm Password, success screen
with the "waiting for approval" message, link to/from Login); `PendingApproval.tsx`,
shown by `RequireAuth` instead of the app shell for a `PENDING` account (informational
only — every real route is still blocked server-side regardless); `RequirePermission`
route guard, and `/reports` moved onto it (`report:view`) instead of the old
Admin/Manager-only `RequireRole`; `lib/auth.ts`'s `hasPermission()` fixed to match
the backend's new rule (only Admin bypasses — this was still checking for Manager
too, a real bug that would have kept every Manager's frontend acting as if they had
full access even after the backend addendum landed); a new shared `lib/permissions.ts`
(module/permission grid, presets) and `PermissionPicker` component (preset dropdown +
per-module Data Scope toggle + checkboxes + the delegated-grant checkbox when
applicable) — used by both the new Admin approval panel and the existing per-user
Permissions dialog, not two separate pickers; Employees.tsx gained the Pending
Approval section, `ApprovalDialog` (Role select defaulting to the matching preset,
Reject/Approve), and Suspend Access/Reactivate buttons alongside the existing
unchanged Deactivate/Activate — visibility on every action matches
`canManageAccount()`, a frontend mirror of the backend's `assertManagesUser` (a
Manager only ever sees these for their own Employees, never for another Manager).

## Verified

Backend `tsc`/`eslint` clean (0 errors) at every stage. Frontend `tsc`/`eslint`/
`vite build` clean (0 errors, one new instance of the same pre-existing
`react-hooks/incompatible-library` pattern already seen 5 times elsewhere in this
app). Live-tested end to end against the real database, cleanup done after each
round: signup → `PENDING`/`role=null`; a `PENDING` login succeeds but `GET
/customers` 403s and every global-search group comes back empty; Admin's pending
queue; approve as Employee with `customerDataScope=ASSIGNED`/`orderDataScope=ALL` →
that Employee correctly sees zero customers but every company order, confirming Data
Scope is enforced per-module independently; suspend → immediate 401 on the very next
request, no re-login involved; reactivate → works again immediately; reject →
blocked from login with the existing message; a fresh Admin-created Manager gets the
full permission set minus `employee:manage-permissions`; a Manager without that
grant gets a clear 403 editing an Employee's permissions, and the identical request
succeeds immediately after an Admin grants it, with no re-login — confirming the
request-time re-check pattern (already established for account status) applies
equally to permission grants. One real bug found and fixed during this testing:
`userService.approve()` was returning the pre-data-scope-update user object when
`permissions` and a data scope were submitted together, so the API call succeeded
and saved correctly but the response lied about it.

No browser automation is available in this environment, so the frontend's actual
rendering (dialog layout, preset dropdown behavior, the Pending Approval section's
visual placement) is verified by code review and matching-shape API contract
testing, not a live click-through — same limitation and same mitigation already
documented for the responsive-layout work earlier in this project.
