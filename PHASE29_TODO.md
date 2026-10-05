# Phase 29 — Prisma migrations over Neon's direct connection (`DIRECT_URL`)

**Status: released 2026-10-06 — live on Render at 00:15 IST with `DIRECT_URL` set;
migrations now run over Neon's direct connection.**

> Numbering: this is the **new** Phase 29. The earlier change once numbered Phase 29
> (Trash window 10 → 30 days) was merged into `PHASE27_TODO.md` as **Part B**; the
> applied migration `20261005120000_trash_retention_30_days` still says "Phase 29"
> in its comment and is deliberately never edited.

## Why

The Phase 27 Part B release failed its first Render deploy: `prisma migrate deploy`
(the start command's first step) timed out with **P1002 acquiring a Postgres
advisory lock**. `DATABASE_URL` points at Neon's **pooled** host (`…-pooler…`), and
Prisma's migration lock is a session-level advisory lock, which is unreliable
through a connection pooler. Neon and Prisma both recommend running migrations
over a **direct** (non-pooled) connection.

## The change

```
pooled  DATABASE_URL → the application (unchanged)
direct  DIRECT_URL   → Prisma CLI: migrate deploy / migrate status
```

| File | Change |
|---|---|
| `backend/prisma.config.ts` | `datasource.url = DIRECT_URL if set, else DATABASE_URL`. In Prisma 7 this URL is used **only by the Prisma CLI**; the app connects through `src/config.ts` + the pg adapter with `DATABASE_URL` |
| `backend/.env.example` | Documents the optional `DIRECT_URL` |
| `backend/src/utils/trash.ts`, `frontend/src/lib/trash.ts` | Comment-only: "Phase 29" → "Phase 27 Part B", so the number has one meaning |

**Unchanged:** the app runtime, every migration file, the Render build/start
commands. No schema or data change.

**Safe in either order:** if the code deploys before `DIRECT_URL` exists in Render,
migrations fall back to `DATABASE_URL` — exactly today's behaviour.

## Render prerequisite (user)

Render → backend service → **Environment** → add

```
DIRECT_URL = <Neon connection string with "-pooler" removed from the host>
```

e.g. `ep-<endpoint>-pooler.<region>.aws.neon.tech` → `ep-<endpoint>.<region>.aws.neon.tech`
(the Neon dashboard shows it with "Connection pooling" off).

## TODO checklist

- [x] `prisma.config.ts` uses `DIRECT_URL` when set
- [x] `.env.example` documents it
- [x] `tsc` (backend + frontend) / ESLint clean
- [x] Local verification — **all pass** (throwaway Docker Postgres `crm-p29-direct`;
      every command set both URLs explicitly so `backend/.env`'s production URL could
      never be used; `backend/.env` has no `DIRECT_URL`):
  - [x] **L1** `DIRECT_URL` working + `DATABASE_URL` deliberately broken → `migrate deploy`
        applied all 29 migrations to the `DIRECT_URL` database (log: `Datasource … "p29_direct"`)
  - [x] **L1b** `migrate status` (read-only) also uses `DIRECT_URL` → "Database schema is up to date"
  - [x] **L2** no `DIRECT_URL` → falls back to `DATABASE_URL` (29 applied to `p29_fallback`)
  - [x] **L2b** no `DIRECT_URL` + broken `DATABASE_URL` → P1001, proving the fallback really uses `DATABASE_URL`
  - [x] **L3** app started with a **broken `DIRECT_URL`** → `/api/health` 200, and a login (DB query)
        returns the normal 401 "Invalid email or password" — the app ignores `DIRECT_URL`
- [x] User added `DIRECT_URL` in Render
- [x] Production: the Render log shows migrations connecting to the host **without**
      `-pooler`; deploy live; app healthy. No data change (see below).

## Production release (2026-10-05 / 06)

Pushed `f05b1c8` (docs) + `20430b3` (code) at 23:29 IST, 2026-10-05.

**First deploy FAILED (23:39 IST)** — but the log proved the change works:
`Datasource "db": PostgreSQL database "neondb", schema "public" at
"ep-…​.c-5.us-east-2.aws.neon.tech"` — the **direct** host, no `-pooler` — then
**P1002, timed out acquiring the migration advisory lock** (`pg_advisory_lock(72707369)`).

**Cause: a lock left behind by the previous, pooled deploy.** Prisma takes a
session-level advisory lock before migrating. Through Neon's pooler, the unlock can
run on a different pooled server connection than the lock, so the lock stays held
by an idle pooled connection. The 23:12 deploy of `6e26507` — still migrating
through the pooler — most likely left it held. So even the direct connection had to
wait for it.

Meanwhile the previous backend (`6e26507`) kept serving; no data changed (no
pending migrations).

**Second deploy LIVE at 00:15 IST, 2026-10-06** ("Deploy live for 20430b3"), once the
held lock was gone. Production health check: backend `/api/health` 200, frontend 200.

**From now on:** migrations connect directly. When the migrate process exits, its
session ends and Postgres releases the advisory lock with it, so a deploy can no
longer leave a lock behind for the next one. If a deploy ever times out on this lock
again, the Neon SQL Editor query to find the holder is:

```sql
SELECT l.pid, a.state, a.backend_start, a.application_name
FROM pg_locks l JOIN pg_stat_activity a USING (pid)
WHERE l.locktype = 'advisory' AND l.objid = 72707369;
```
