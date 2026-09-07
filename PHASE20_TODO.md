# Phase 20 — First-Load Performance: Kill the Auth Waterfall, Then the Rest

**Status: Steps 1–5D implemented, verified locally, and committed
(`ab8d80a`, `359aaa9`, `49c64ae`, `f67c4ed`, plus Step 5D's commit) — none
pushed yet. Step 6 (hosting/region factors) is the only remaining item before
the full chain goes to `origin/main` together.**

Reviewed by the user after the architecture was finalized; the review approved the
plan with a few concrete refinements, folded in below (a redirect-loop guard for
the 401 handler, and confirming `getForUser`'s actual dependency rather than
trusting the variable name before parallelizing it — both addressed during
implementation, see Step 2/Step 3 below).

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

### Step 1 — Stop `RequireAuth` blocking `<Outlet/>` on `/auth/me` ✅ done

- [x] `RequireAuth.tsx`: renders `<Outlet/>` as soon as `/auth/me` is no longer
      `isPending` **or** hasn't failed yet — i.e. it only ever blocks on the brief
      "don't know the answer yet" window, never waits for a *successful* answer
      specifically. `Navbar`/`Sidebar`/`Home`'s greeting already tolerate
      `currentUser === undefined` via existing optional chaining — confirmed by
      reading each, not assumed.
- [x] First paint (before `/auth/me` resolves) shows the normal shell with
      whatever each component's own `undefined`-tolerant fallback is (empty nav
      filtering, blank greeting) — no separate full-shell skeleton added, per the
      "don't block" goal.
- [x] `RequireAuth.tsx` still owns the PENDING-account screen and the
      confirmed-401 redirect — it just no longer delays anything else from
      starting while `/auth/me` is in flight.

### Step 2 — One shared 401 → redirect handler, not per-query duplication ✅ done

- [x] `queryClient.ts` gets a `QueryCache`/`MutationCache`-level `onError` that
      redirects to `/login` on any `ApiError` with `status === 401` — covers
      every `useQuery`/`useMutation` call site automatically, nothing per-page.
- [x] **Review refinement, addressed**: added a module-level `redirectingToLogin`
      guard. Once the waterfall is gone, several protected requests can be in
      flight together (e.g. `/auth/me` and `/dashboard/summary` firing in
      parallel) — an expired session could 401 more than one of them in the same
      tick, and this guard makes sure only the first one triggers the actual
      redirect.
- [x] Retrying a 401 is now explicitly skipped (`retry` checks for
      `error.status === 401`) — retrying it would just fail again and only delay
      the redirect.
- [x] `RequireAuth` still separately redirects when `/auth/me` itself errors —
      intentionally redundant with the global handler (belt-and-suspenders, not
      a conflict — both go to the same place).
- [ ] Confirmed no protected queries run on `/login` itself by inspection (no
      `useQuery` calls in `Login.tsx`) — not yet exercised by an actual expired
      session hitting the page live.

### Step 3 — Fix `/auth/me`'s duplicate queries and the middleware's own sequencing ✅ done

- [x] `authenticate` middleware: `userRepository.findById(payload.sub)` and
      `permissionRepository.getForUser(payload.sub)` now run in `Promise.all`.
      **Review refinement, addressed**: verified `permission.repository.ts`'s
      `getForUser(userId)` implementation directly before parallelizing — it's a
      plain `userPermission.findMany({where:{userId}})` with no dependency on the
      `user` row itself, so the parallelization is confirmed safe, not assumed
      from the parameter name.
- [x] `authService.me` no longer re-fetches permissions — it now takes them as a
      parameter (`me(userId, permissions)`), reusing what `authenticate` already
      put on `req.user`. Still does one `userRepository.findById` for the
      display fields `req.user` doesn't carry (name/email/phone/status) — went
      with "one minimal supplemental query" rather than widening `req.user`
      itself, since nothing else in the codebase needs those fields on every
      request, just this one endpoint.
- [x] Net effect: `/auth/me` goes from 4 sequential queries (2 in middleware + 2
      duplicated in the controller) to 2 queries in parallel (middleware) + 1
      more (controller) — 3 total, and the first 2 overlap.

### Step 4 — Verify Steps 1–3 before moving on (local — production not yet touched)

- [x] `GET /auth/me` correctness: response shape unchanged
      (`{id,name,email,phone,role,status,permissions}`), matches the frontend's
      `CurrentUser` type.
- [x] `GET /auth/me` with an invalid/missing session still 401s correctly.
- [x] Timing, local dev backend (same shared Neon DB as production, just without
      Render's own network hop): 5 back-to-back calls settled at a consistent
      **~0.53s each** — before this change, the equivalent production
      measurement (Steps 1-3 not yet deployed) was ~0.93–0.99s per call. Not an
      apples-to-apples environment (local vs. Render), but confirms the dedup
      removed real, measurable work rather than just reads cleaner.
  - [ ] Same measurement against **production**, before vs. after, hasn't been
        done yet — nothing's been pushed/deployed. Planned for after this
        check-in.
- [x] `GET /customers` (any authenticated route benefits from the middleware fix,
      not just `/auth/me`) still returns correct data, ~1.05s settled.
- [x] `tsc --noEmit` clean on both frontend and backend after every edit in this
      step.
- [x] **Real browser confirmation (headless Chrome via Playwright, driven against
      the local dev stack, session cookie injected directly rather than through
      the login form)**: `GET /auth/me` and `GET /dashboard/summary` both start
      **within 1ms of each other** on first load of `/` (162ms/162ms and
      165ms/166ms across two separate runs) — the waterfall is confirmed gone
      at the actual network level, not just by reasoning about the code.
  - `/auth/me` took 2.1–3.5s end to end across the two runs (varied — see the
    connection-pool-idle-timeout note in Step 3/production section; this is
    consistent with a cold Neon reconnect between spaced-apart local requests,
    not a regression from this change).
  - `/dashboard/summary` took 5.0–6.0s — slow, as expected, and exactly what
    Step 5 exists to fix. Recorded here as the **local baseline to compare
    against** once Step 5 lands.
  - `/trash` (Admin-only `trashCountQuery`, gated on `isAdmin` which itself
    depends on `currentUser`) correctly fires *after* `/auth/me` resolves —
    this is expected, intentional sequencing (it needs to know the role
    first), not a regression of the fix.
- [x] Screenshot confirms the dashboard renders correctly: full data (Total
      Sales, Orders, Customers, Low Stock, etc.), correct greeting
      ("Good Morning, Administrator"), full role-appropriate sidebar nav,
      Trash badge count — no visual or functional regression.
- [x] Expired/invalid session test (garbage cookie value): both `/auth/me` and
      `/dashboard/summary` independently 401'd (confirming the backend really
      is the boundary, not just `RequireAuth`), and despite **three** 401
      responses arriving (two for `/auth/me` — React 18 `StrictMode`
      double-invokes effects/queries in dev only, not production; one for
      `/dashboard/summary`), the redirect guard produced **exactly one**
      navigation to `/login`, no loop, no hang.
- [x] One pre-existing console 404 noticed during the run, for a resource that
      never appeared in the `/api/*` traffic — almost certainly `favicon.ico`
      (Vite dev apps commonly lack one) and unrelated to this change; not
      chased further since it doesn't affect the app.
- [ ] PENDING-account-status screen specifically not exercised (would need a
      real PENDING test account) — reasoned through by reading the component's
      logic, not visually confirmed. Low risk (`user?.status === 'PENDING'`
      check is unchanged from before, just no longer gates `<Outlet/>` itself).
- [ ] Production before/after timing comparison — still not done, since nothing
      has been pushed yet.

### Step 5 — `dashboard.service.ts`'s `getSummary()`, informed by the table above

#### Step 5A — instrumentation ✅ done, real numbers captured

Added a temporary `timed(label, fn)` wrapper around every query in the
`Promise.all` (plus finer splits inside `topProducts`, `outstandingTotal`, and
`productService.list`'s `lowStock` branch — DB fetch vs. in-JS filter/sort
measured separately), and a total-batch timer around the whole `Promise.all`.
Local dev backend, 3 consecutive requests, same shared Neon DB as production:

| Query | Run 1 (cold pool) | Run 2 | Run 3 (warm pool) |
|---|---|---|---|
| `totalCustomers` | 268ms | 252ms | 257ms |
| `totalSalesAllTime` | 269ms | 265ms | 259ms |
| `outstanding.orderTotals`/`.paid` | 518/756ms | 523/745ms | 493/493ms |
| `topProducts.groupBy` | 1268ms | 1307ms | 505ms |
| `topProducts.findMany` | 740ms | 662ms | 253ms |
| `totalOrders` | 1766ms | 1760ms | 250ms |
| `ordersToday` | 2480ms | 2062ms | 251ms |
| `lowStock.findAllMatching` (17 rows) | 2010ms | 1970ms | 764ms |
| `lowStock.filterSortInJS` | 0ms | 0ms | 0ms |
| **TOTAL `Promise.all`** | **2480ms** | **2267ms** | **779ms** |
| `trackingToday` (sequential, *after* the batch, no contention) | 267ms | 254ms | 262ms |

**This is Case C, decisively — connection pool contention, not query-shape
problems, is the dominant cost for most of these 19 queries.** The evidence:

1. **Warm-pool run (3) shows a clean two-wave pattern**: ~10 queries finish in
   249–507ms (the pool's 10 connections, immediately available), the remaining
   ~9 queue and finish in 758–779ms (waiting for one of those 10 to free up,
   then completing fast once they get it). That's exactly the signature of
   `pg.Pool`'s default `max: 10` being smaller than the ~19-query fan-out —
   not a coincidence.
2. **`trackingToday`, run outside the contended batch, is consistently ~250–270ms
   across all 3 runs** — the same *kind* of simple query that takes up to
   2480ms *inside* the batch takes a quarter-second once it isn't competing
   for a connection. Same query shape, wildly different cost, purely a
   function of contention.
3. **Simple `count()` queries (`totalOrders`, `ordersToday`) are among the
   *slowest* in the cold runs** — there's no query-shape reason a `count()`
   should take 1.7–2.5s; that's queueing time, not execution time.
4. **`lowStock`'s in-JS filter/sort is `0ms` every single run** — the concern
   about it not scaling as the catalog grows is still real and worth fixing
   for the future (only 17 rows in this dataset), but it is **not** currently
   contributing meaningful latency; its slot in the table is dominated by
   queue position like everything else, not its own query shape.
5. **`topProducts`'s two sequential queries are a real, independent cost**
   (505+253=758ms even warm) — smaller than the pool-contention effect, but
   genuine and worth folding into one query or running the two round-trips
   back-to-back with less overhead, on its own merits.
6. **Cold-pool runs (1–2, ~2.3–2.5s total) vs. warm-pool run (3, 0.78s)** is
   also its own separate, real finding: the *first* dashboard load after any
   gap pays for re-establishing however many of the pool's connections had
   gone idle/closed, on top of whatever contention exists — consistent with
   the pg.Pool default 10s `idleTimeoutMillis` already suspected in the
   original production investigation.

**Revised priority, based on this data (checking in before proceeding —
see chat)**: raising `pg.Pool`'s `max` (or reducing how many queries fire
concurrently per dashboard load, which has the same effect from the other
direction) looks like the single highest-leverage fix here, not the
last-resort item originally hypothesized before real numbers existed. The
`trackingToday` fold-in and `topProducts`/`lowStock` query-shape fixes are
still worth doing — smaller, genuine, independent wins — but none of them is
the dominant cost the way pool contention is.

- [ ] **Not yet decided — needs a decision before proceeding**: increase
      `pg.Pool`'s `max`, reduce concurrent query count via the essential/
      analytics split (or both — they're complementary, not either/or: a
      larger pool helps *this* request's internal fan-out, while fewer queries
      per request helps when *multiple users* load the dashboard at the same
      time and would otherwise all compete for the same enlarged pool anyway).
- [ ] Fold `trackingToday` into the main `Promise.all` — it doesn't depend on any
      of the other results, there's no reason it runs after them (small,
      independent win regardless of the pool-size decision).
- [ ] Fix `lowStock`'s full-table fetch-then-filter-in-JS
      (`product.service.ts:92-105`) — confirmed not currently a hot path
      (17 rows, 0ms JS time), but a real scalability risk as the product
      catalog grows; push the `availableQty < minimumStock` comparison into
      the database query instead of loading every matching product.
- [ ] `topProducts`'s two sequential queries (758ms combined even warm) — worth
      addressing on its own, independent of the pool-size decision.
- [ ] Revisit whether all ~19 belong in one response at all (the "essential now,
      analytics after" split) — still a real option and still the one item
      here that's an API/shape change rather than a pure optimization, but its
      priority relative to "just increase the pool" needs the check-in below.
- [ ] Remove the Step 5A timing instrumentation once the above is decided and
      implemented — it's diagnostic, not meant to ship long-term.

#### Step 5B — `pg.Pool.max: 10 → 20`, benchmarked ✅ done — real tradeoff found, not a clean win

`backend/src/lib/prisma.ts` — `new PrismaPg({ connectionString, max: 20 })`.
Same 3-run benchmark, then a 3-concurrent-request test as instructed:

| | max=10 cold | max=10 warm | max=20 cold | max=20 warm | max=20, 3 concurrent |
|---|---|---|---|---|---|
| Internal `Promise.all` | 2480ms | 779ms | **3839ms** | **515–526ms** | 981–1213ms each |
| External (curl) total | 4783ms | 1308ms | **7192ms** | **1032–1062ms** | 1506–1732ms each |

**Warm-state result matches what you predicted**: the two-wave pattern shrank
substantially (previously a ~500ms gap between waves, now ~250ms — didn't fully
collapse into one wave, because the real concurrent DB-operation count is
~19–22 once `topProducts`'s and `outstanding`'s internal pairs are counted, right
at the edge of the new pool size of 20). Warm total dropped ~33–35% both
internally and externally.

**But the cold-state result went the other way** — the very first request after
the pool starts empty got *slower*, not faster: 2480ms → 3839ms internally,
4.8s → 7.2s externally. Establishing up to 20 fresh TLS connections to Neon
simultaneously costs more up front than establishing 10, and nothing amortizes
that for the very first visitor. This is exactly the scenario that motivated
this whole investigation (the "why does first load take so long" question) —
so a fix that helps every *subsequent* load but makes the *very first* one
worse is a real, not obviously-net-positive tradeoff, not a clean win to just
"keep."

**3-concurrent-request test** (3 simultaneous `curl`s, warm pool): each request's
internal `Promise.all` rose to 981–1213ms (vs. 515–526ms solo) — roughly 2x
slower under 3x concurrent load, not a linear 3x or a cliff/failure. No errors,
no timeouts. Graceful degradation, consistent with 3×~20 concurrent DB
operations queuing against one shared pool of 20.

**Not decided yet — flagging before treating this as final**: keep `max: 20`
despite the cold-case regression (reasonable if the app stays warm most of the
time in practice, especially once a keep-alive ping is in place — see the
free-tier discussion), try a smaller number as a middle ground (e.g. 15), or
hold off on the pool change entirely until the essential/analytics split
reduces concurrent query count first (which would make *any* pool size look
better, cold or warm, since there'd be far fewer connections to establish/queue
for in the first place).

#### Step 5C — essential/analytics split ✅ done

Decision from the Step 5B review: hold `max: 20`, reduce query *count* per
request first (fewer concurrent queries makes any pool size perform better,
cold or warm), then re-benchmark pool size against the smaller fan-out.

**Pool**: `backend/src/lib/prisma.ts` reverted to the default (`max: 10`, no
override) — done before this step, see Step 5B's file.

**Backend split** — `dashboard.service.ts`'s single `getSummary()` (11 queries
across a combined `Promise.all`, `trackingToday` folded in rather than left as
a separate sequential-after-Promise.all call) split into:
- `getSummary()` — essential, first-paint-only: customer/order counts, today's
  counts, order/delivery/payment status breakdowns, total products, recent
  orders/customers, today's tracking counts. **11 queries.**
- `getAnalytics()` — heavier, secondary: sales aggregation (all-time/today/
  week/month), outstanding total, payments collected today, top products,
  low-stock and out-of-stock product lists. **9 queries** (some, like
  `outstanding`/`topProducts`, internally run 2 queries each).

Both keep the Step 5A `timed()` per-query wrapper, and each now has its own
`TOTAL Promise.all` wrapper (the original single combined-total line from
Step 5A didn't carry over automatically when the one `Promise.all` became
two — added back explicitly so the two halves stay comparable to each other
and to the pre-split baseline before the pool re-benchmark).

New route: `GET /dashboard/analytics` (`dashboard.controller.ts`,
`routes/api/dashboard.ts`) — same `authenticate`-only gate as `/summary`, no
extra permission required.

**Frontend** — `frontend/src/pages/Home.tsx`:
- `DashboardSummary` interface split into `DashboardEssential` and
  `DashboardAnalytics`, matching the two response shapes.
- `Home()` now runs two React Query queries: `summaryQuery` (unchanged
  query key/endpoint, now typed as essential-only) and a new `analyticsQuery`
  hitting `/dashboard/analytics`, gated with `enabled: summaryQuery.isSuccess
  && !isEmployee` — deliberately *not* fired alongside `summaryQuery`, since
  doing so would still be ~19–22 concurrent queries split across 2 HTTP
  requests instead of 1, which wouldn't reduce peak pool pressure (the actual
  goal here). Employees never see analytics data at all, so the query is
  skipped entirely for them, not just hidden in the UI.
- `AdminManagerDashboard` now takes `{ essential, analytics }` — every
  analytics-dependent section (Total Sales / Outstanding Amount / Low Stock
  Products stat cards in the top grid, the Sales Summary card, Low Stock/Out
  of Stock cards, Top Products card) renders a skeleton until `analytics`
  resolves; every other section reads `essential` directly with no loading
  gate, since it's already available by the time this component renders at
  all.
- `EmployeeDashboard` now takes `{ essential }` only — confirmed by reading
  its full body that it never referenced any analytics field, so this was a
  pure prop rename, no loading-state logic needed.

**Verified locally**: typecheck clean on both frontend and backend. Hit both
new endpoints directly with an Admin JWT — correct, independent JSON shapes.
Browser check (Playwright + system Chrome, logged in as Admin) confirmed:
`/api/dashboard/summary` fires first, `/api/dashboard/analytics` fires only
after it resolves (~800ms after, in the observed run), and the full dashboard
renders correctly — every essential and analytics-dependent section populated
with real data, no console errors, no redirect loop. Screenshot reviewed.

**Query-count result, single warm request** (Admin, solo — not yet the
multi-user/concurrent case Step 5B tested):
- `getSummary` (11 queries): `TOTAL Promise.all` **2518ms** in one capture —
  this was the first request after a file-triggered `ts-node-dev` restart, so
  it's effectively a cold sample, not a clean warm baseline; needs a proper
  re-run as part of Step 5D below before drawing conclusions from it.
- `getAnalytics` (9 queries): `TOTAL Promise.all` **525ms**, immediately
  after, on an already-warmed pool.

These single-sample numbers aren't the real comparison — next is a proper
repeat of the Step 5A/5B benchmark methodology (3 warm runs, 1 cold run,
3-concurrent-request test) against the two new, smaller endpoints, at pool
`max` 10 / 15 / 20, before deciding a final pool size.

- [x] Commit Step 5C locally (already typechecked, verified) — `f67c4ed`.

#### Step 5D — post-split pool re-benchmark (`max` 10 / 15 / 20) ✅ done — max: 10 wins outright

Re-ran the Step 5A/5B methodology against the two new, smaller endpoints: cold
(first request after a genuine process restart, so the pool starts empty),
3 warm, then 3-concurrent — for both `/summary` (11 queries) and `/analytics`
(9 queries), at each pool size. Local dev backend, same shared Neon DB.

| | `max=10` | `max=15` | `max=20` |
|---|---|---|---|
| `/summary` cold — internal / curl | 2423ms / 2.70s | 2622ms / 2.89s | 2320ms / 2.59s |
| `/summary` warm (3) — internal | 507 / 500 / 499ms | 509 / 493 / 496ms | 512 / 507 / 503ms |
| `/analytics` first-after-summary — internal / curl | 520ms / 0.77s | 505ms / 0.77s | 512ms / 0.78s |
| `/analytics` warm (3) — internal | 524 / 501 / 515ms | 500 / 757 / 520ms | 524 / 498 / 519ms |
| `/summary` 3-concurrent — internal | 991 / 984 / 1201ms | 742 / 969 / **2264ms** | 762 / **3389 / 3395ms** |
| `/summary` 3-concurrent — curl total | 1.24 / 1.23 / 1.47s | 1.02 / 1.24 / **2.52s** | 1.02 / **3.65 / 3.65s** |
| `/analytics` 3-concurrent — internal | 1037 / 1084 / 1246ms | 746 / 756 / 983ms | 515 / 723 / 751ms |

**Cold and solo-warm performance is statistically flat across all three pool
sizes** (~2.3–2.9s cold, ~500ms warm, for both endpoints) — expected, since
neither endpoint alone ever needs more than 11 concurrent connections, well
under even `max: 10`. This confirms the Step 5C split, not pool size, is what
fixed the "single request is slow" problem; raising the pool above the
per-request query count buys nothing for a solo request.

**Concurrency is where pool size actually mattered — and larger was worse, not
better.** `max: 10`'s 3-concurrent `/summary` result was stable and reproducible
(re-ran it twice more afterward: 990/1202/980ms, then 982/1207ms — consistently
~1–1.2s, no outliers). `max: 15` produced one spike to 2264ms/2.52s out of three
requests. `max: 20` was reproducibly bad — re-ran its 3-concurrent `/summary`
test a second time and got *worse*: 740/2452/2540ms internal (4.3–4.8s curl
total) — not a one-off blip. The apparent mechanism: with more of the pool's
capacity available, a sudden burst of concurrent demand causes more *new*
connections to be established simultaneously (each paying Neon's own TLS/auth
handshake cost) rather than queuing behind a small number of already-warm
connections and reusing them — so a bigger local pool can make a burst *more*
expensive against a remote serverless Postgres endpoint, not less. This is the
opposite of the intuition that motivated Step 5B in the first place, and only
showed up once query count per request was already small enough for
concurrency (not per-request fan-out) to become the dominant variable.

**Decision: keep the pool at its default (`max: 10`, no override).** It matches
or beats 15 and 20 on every measurement here, including the one dimension
(concurrent multi-user load) that's actually representative of production
traffic, and it's also the simplest code (no magic number to justify).
`backend/src/lib/prisma.ts`'s comment updated to record this reasoning and the
headline numbers.

- [x] Removed the Step 5A/5C temporary `timed()` per-query instrumentation from
      `dashboard.service.ts` (the wrapper function and every call site) and the
      `lowStock` DB-fetch/JS-filter split-timing from `product.service.ts` — the
      comparison it existed for is complete. Confirmed `tsc --noEmit` clean on
      the backend afterward, and both endpoints re-verified with a fresh curl
      smoke test (200, correct data, no timing-log noise) before removal was
      considered done.
- [ ] Commit Step 5D (pool comment update + instrumentation removal). Do not
      push yet — the full Phase 20 commit chain goes to `origin/main` together,
      only after Step 6 is also done.

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
