# Phase 20 — First-Load Performance: Kill the Auth Waterfall, Then the Rest

**Status: Architecture finalized, nothing implemented yet — per explicit instruction,
this document is the plan to review before any code changes start.**

This follows two prior investigative turns (not committed as code, just findings):
1. Production timing measurements (Render + Neon), which found Render itself
   already warm but every DB-touching request sitting on a ~1s floor even when
   warm, with cold paths at 2.3–3.1s.
2. A code-level trace of *why*, which is what turned this into an actual plan
   instead of just "the free tier is slow."

## What's actually happening today (traced in the code, not guessed)

### 1. The frontend waterfall — confirmed in `App.tsx` + `RequireAuth.tsx`

```
frontend/src/App.tsx:
  <Route element={<RequireAuth />}>
    <Route element={<AppShell />}>
      <Route path="/" element={<Home />} />
      ...

frontend/src/components/RequireAuth.tsx:
  const { data: user, isPending } = useCurrentUser();   // GET /auth/me
  if (isPending) return <Skeleton />;                    // <-- nothing else renders
  ...
  return <Outlet />;                                     // AppShell + Home only mount here
```

`Home.tsx`'s own `summaryQuery` (`GET /dashboard/summary`) has **no `enabled` gate at
all** — it's not the dashboard query waiting on auth, it's that `<Home />` itself
doesn't exist in the DOM tree until `RequireAuth` stops being `isPending`. So today:

```
mount  ──▶ GET /auth/me ──▶ (wait ~1–2.3s) ──▶ <Outlet/> renders ──▶ Home mounts
                                                                          │
                                                                          ▼
                                                              GET /dashboard/summary
                                                                          │
                                                                    (wait ~1.6–3.1s)
                                                                          ▼
                                                                    Dashboard visible
```
Total: sum of both, not the max of both. That's the single biggest lever.

### 2. `/auth/me` redundantly does its own two queries *twice*

Traced `authenticate` middleware (`backend/src/middleware/authenticate.ts`) →
`authController.me` (`backend/src/controllers/auth.controller.ts:38`) →
`authService.me` (`backend/src/services/auth.service.ts:86`):

```
authenticate middleware (runs on every protected request, not just /auth/me):
  1. userRepository.findById(payload.sub)         -- query A
  2. permissionRepository.getForUser(user.id)      -- query B  (sequential, not parallel,
                                                       even though it only needs
                                                       payload.sub, which is already
                                                       known before query A runs)

authController.me / authService.me (only for GET /auth/me specifically):
  3. userRepository.findById(userId)               -- query A again, same user
  4. permissionRepository.getForUser(user.id)       -- query B again, same permissions
```

`GET /auth/me` does the *identical pair of queries twice* — once to populate
`req.user` for the request, then again to build the response, because the
controller never reuses what the middleware already fetched. This alone likely
accounts for a meaningful chunk of its ~1–2.3s. And because queries A+B run on
*every* authenticated request (not just `/auth/me`), the sequential-not-parallel
part of this affects every single API call in the app, which is consistent with
`/customers`, `/orders`, `/users` all measuring ~0.9–1.2s despite being otherwise
simple queries.

### 3. `dashboard.service.ts`'s `getSummary()` — the full query inventory

Not 19 independent equals-cost queries — closer to **22 actual DB round-trips**,
several of them individually inefficient, and one of them not even inside the
`Promise.all`:

| Group | Queries | Notes |
|---|---|---|
| Cheap counts | `totalCustomers`, `newCustomersToday`, `totalOrders`, `ordersToday`, `totalProducts` | 5 simple `count()`s |
| Status breakdowns | `byOrderStatus`, `byDeliveryStatus`, `byPaymentStatus` | 3 `groupBy()`s |
| Sales aggregation | `totalSalesAllTime`, `salesToday`, `salesThisWeek`, `salesThisMonth`, `paymentsToday` | 5 `aggregate()`s |
| `outstandingTotal()` | 2 queries internally (already `Promise.all`'d, fine) | |
| Recent activity | `recentOrders`, `recentCustomers` | 2 `findMany({take:5})`s, cheap |
| `topProducts()` | 2 **sequential** queries (`groupBy` then `findMany` on the resulting IDs) | can't trivially parallelize, but worth naming |
| `lowStock` (`productService.list({stock:'low'})`) | fetches **every** matching product with no `take`, then filters/sorts/paginates to 5 **in JavaScript** (`product.service.ts:92-105`, `findAllMatching`) | real inefficiency, not just "one more query" |
| `outOfStock` (`productService.list({stock:'out'})`) | normal DB-level filter + pagination, fine | |
| `trackingToday` | runs **after** the `Promise.all` resolves, sequentially — `await prisma.deliveryTracking.findMany(...)` at `dashboard.service.ts:216`, despite not depending on any of the 19 results | free win: fold into the same `Promise.all` |

Default `pg.Pool` max is 10 connections (`backend/src/lib/prisma.ts` passes no
`max` override). With ~19+ concurrent queries fired from one `Promise.all`, at
least half of them queue for a free pooled connection instead of running truly in
parallel — a real, separate cost from network latency.

### 4. No global 401 handling exists yet

Checked `frontend/src/lib/api.ts`'s `apiFetch` and `frontend/src/lib/queryClient.ts`
— neither does anything with a 401 beyond throwing `ApiError`. `RequireAuth` is
currently the *only* place that translates "not authenticated" into a redirect to
`/login`, and it does that by owning `/auth/me` itself. This has to be replaced
with something equivalent before `/auth/me` can stop being the gatekeeper, or an
expired/missing session would just leave protected pages showing failed queries
forever instead of redirecting.

## Target architecture

```
                          Browser navigates to "/"
                                     │
                                     ▼
                        RequireAuth renders children
                         immediately (no longer waits
                          for /auth/me to resolve)
                                     │
                    ┌────────────────┴────────────────┐
                    ▼                                  ▼
             GET /auth/me                    GET /dashboard/summary
          (still fired, in parallel —          (fires the instant Home
           tells the UI who's logged in         mounts, no longer gated
           and drives Sidebar/Navbar/            on currentUser at all)
           permission-based UI)
                    │                                  │
                    ▼                                  ▼
         backend: authenticate            backend: authenticate middleware
         middleware (still runs,          (same middleware, same verification —
         still the real gate)             this is what actually protects the data,
                    │                      not the frontend)
                    ▼                                  │
              200 + user                                ▼
              or 401                            200 + dashboard data
                                                      or 401
                    │                                  │
                    └────────────────┬─────────────────┘
                                     ▼
                    Either query returning 401 triggers
                    ONE shared redirect-to-/login handler
                    (not duplicated per-query)
```

**The security invariant, stated explicitly**: `authenticate` middleware
(`backend/src/middleware/authenticate.ts`) and every route's `authorize()` /
`requireRole()` / `checkCustomerAccess` / `checkOrderAccess` gate are completely
untouched by this plan. `RequireAuth` becomes purely a UX nicety (stops
guaranteed-blank-until-verified rendering), never the actual access boundary — it
never was meant to be one, but this makes that explicit rather than incidentally
true. Every protected endpoint keeps independently verifying the session on every
request, exactly as today.

## Sequencing (matches the priority order already agreed)

### Step 1 — Stop `RequireAuth` blocking `<Outlet/>` on `/auth/me`

- [ ] `RequireAuth.tsx`: render `<Outlet/>` immediately instead of an `isPending`
      skeleton gate. Needs a decision on what "immediately" shows for the handful
      of components that read `currentUser` synchronously before it's loaded
      (`Navbar`, `Sidebar`, `Home`'s greeting) — they already handle
      `currentUser === undefined` gracefully today (optional chaining throughout,
      e.g. `currentUser?.name`), so this is expected to be a non-issue, but worth
      confirming per-component during implementation, not assuming.
- [ ] Decide what happens on the *first* paint before `/auth/me` resolves: render
      the shell with empty/loading nav state (simplest, matches how these
      components already degrade), vs. a full-shell skeleton. Recommend the
      former — it's what "don't block" actually means, and every consumer of
      `currentUser` already tolerates `undefined`.
- [ ] `RequireAuth.tsx` keeps owning the PENDING-account screen
      (`user.status === 'PENDING'` → `<PendingApproval/>`) and the redirect for a
      *confirmed* 401 — it just stops being the thing that delays every other
      query from starting.

### Step 2 — One shared 401 → redirect handler, not per-query duplication

- [ ] Add a single place that reacts to any `ApiError` with `status === 401` by
      redirecting to `/login` — candidates: a `QueryCache`-level `onError` in
      `queryClient.ts` (React Query v5 supports this on `QueryCache`/`MutationCache`
      construction), or a thin wrapper around `apiFetch` that checks the status
      and redirects before rethrowing. Needs picking one during implementation;
      leaning toward the `QueryCache` global handler since it covers every
      `useQuery` call site automatically, matching "don't duplicate this per page."
- [ ] `RequireAuth` still separately redirects when `/auth/me` itself comes back
      401/errored (its own `isError` check stays) — the two mechanisms agree
      (both send to `/login`), they just cover different triggers (auth query
      itself vs. any other protected query hitting a stale/missing session).
- [ ] Confirm this doesn't fire a redirect loop on the `/login` page itself (no
      protected queries run there today — verify, don't assume).

### Step 3 — Fix `/auth/me`'s duplicate queries and the middleware's own sequencing

- [ ] `authenticate` middleware: run `userRepository.findById(payload.sub)` and
      `permissionRepository.getForUser(payload.sub)` in `Promise.all` instead of
      sequentially — both only need `payload.sub`, which is known before either
      query starts. Cuts the middleware's own DB time roughly in half, and this
      runs on *every* authenticated request, not just `/auth/me`.
- [ ] `authController.me` / `authService.me`: stop re-fetching what `authenticate`
      already put on `req.user` (id, role, permissions, customerDataScope,
      orderDataScope). Only the fields `req.user` doesn't carry (name, email,
      phone, requestedRole, status, lastLoginAt, createdAt) need a fresh lookup —
      one lean query instead of two redundant ones. Exact shape to work out during
      implementation (either broaden what `authenticate` puts on `req.user` so
      `/auth/me` needs zero extra queries, or keep one minimal supplemental query
      — leaning toward the former, one round-trip total instead of four).

### Step 4 — Verify Steps 1–3 before moving on

- [ ] DevTools Network tab: confirm `/auth/me` and `/dashboard/summary` requests
      now start within the same tick (overlapping, not sequential waterfall).
- [ ] Confirm an expired/missing session redirects to `/login` correctly from a
      *non-Home* protected page too (not just from `/auth/me` failing) — this is
      the part that didn't exist before Step 2 and is the one genuinely new
      failure mode this change introduces if done wrong.
- [ ] Re-run the same production timing measurements as before/after comparison
      (same endpoints, same method) to quantify the actual improvement rather
      than assuming the theoretical one.
- [ ] Regression-check the PENDING-account screen and role-based sidebar/nav
      items still show correctly once `currentUser` arrives a beat after first
      paint.

### Step 5 — `dashboard.service.ts`'s `getSummary()`, informed by the table above

- [ ] Fold `trackingToday` into the main `Promise.all` — it doesn't depend on any
      of the other 19 results, there's no reason it runs after them.
- [ ] Fix `lowStock`'s full-table fetch-then-filter-in-JS
      (`product.service.ts:92-105`) — push the `availableQty < minimumStock`
      comparison into the database query instead of loading every matching
      product to compute 5 rows. (Needs a raw/computed-column comparison since
      it's a column-vs-column condition, not a fixed threshold — a schema/query
      detail to work out during implementation, not now.)
- [ ] Revisit whether all ~19 belong in one response at all, per the "essential
      now, analytics after" split already agreed: Summary counts + status
      breakdowns + recent orders/customers as the fast/first-paint path;
      sales-aggregation-heavy and top-products/low-stock/out-of-stock as a
      second, lazily-loaded call once the fast path has rendered. This is the
      one item in this plan that's a real API/shape change (two endpoints or one
      endpoint with a `?full=true` toggle) rather than a pure backend
      optimization — flagging it as needing its own sign-off before building,
      since it also means `Home.tsx` renders in two stages instead of one.
- [ ] Only after the above: reconsider `pg.Pool`'s default `max: 10` — explicitly
      *not* the first move (per the "don't bump pool size before understanding
      the queries" instruction), revisited only if the query set is still wide
      enough after the fixes above to warrant it.

### Step 6 — Hosting-level factors (last, since 1–5 apply regardless of outcome here)

- [ ] Confirm Render's service region vs. Neon's (`...c-5.us-east-2.aws.neon.tech`)
      — if Render is running somewhere other than `us-east-2`/nearby, that's a
      fixed per-request network cost no amount of query optimization removes.
      Requires checking the Render dashboard directly (no API token available in
      this environment to check programmatically).
  - [ ] If mismatched, moving the Render service to the same region as Neon is a
        config change, not a paid-tier decision — worth doing regardless of
        whether the free tier is kept.
- [ ] Revisit connection pooling only with real numbers in hand from Step 5,
      not before.
- [ ] The free-tier cold-start discussion from before this investigation
      (Render spin-down, Neon autosuspend) still applies independently of
      everything in this document — those are separate, orthogonal fixes
      (upgrade tier / keep-alive ping), not superseded by this plan.

## Explicitly out of scope for this document

- Any actual code change — this file is the plan only, per instruction.
- Removing or weakening `authenticate`, `authorize()`, `requireRole()`,
  `checkCustomerAccess`, or `checkOrderAccess` — none of them are touched.
- Changing what data any role/permission can see — this is purely about *when*
  requests fire and *how many* DB round-trips each one costs, not *what* they
  return.
