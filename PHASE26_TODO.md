# Phase 26 — Returned: default "Received Back At = Kanina" and "Received By = Akash Enterprises"

**Status: implemented and verified locally 2026-10-04 (frontend only).
Never run against production. Not committed.**

- **Browser: 6/6** on a throwaway Docker Postgres (`crm-phase26-test`, `localhost:55432`),
  with request bodies and tracking rows checked.
- The Phase 24 backend suite still passes 23/23 (backend unchanged).
- `tsc` and ESLint clean.

## The request, as given

In the Returned dialog, make Received Back At a selectable location with **Kanina**,
and Received By **Akash Enterprises**. Both are the default selections when the
Returned dialog opens, and staff can still change them.

```
RETURNED
 ├── Received Back At  → Kanina (default) | Other…
 ├── Received By       → Akash Enterprises (default) | Other…
 └── Note (optional)
```

## What changes

| Field, for **Returned** | Before | After |
|---|---|---|
| Received Back At | free-text, empty | **dropdown: Kanina (default) / Other… → free text** |
| Received By | customer's name (default) / Other… | **Akash Enterprises (default) / Other…** — the customer is not offered for a return; the parcel comes back to the business |

- **Files:**
  - `frontend/src/lib/deliveryStatus.ts` — `RETURN_RECEIVED_AT = 'Kanina'`,
    `RETURN_RECEIVED_BY = 'Akash Enterprises'`.
  - `frontend/src/components/ChangeDeliveryStatusDialog.tsx` — the defaults apply
    both when the dialog opens at Returned (Orders table `RETURNED…`) and when
    Returned is picked inside it (Order Details).
- **Unchanged:** Delivered keeps Received By = customer (default) and Delivered At
  pre-filled with the order address. The backend is unchanged: it saves the same
  `location` / `receivedBy` text on the tracking row, now `"Kanina"` /
  `"Akash Enterprises"` by default.

## TODO checklist

- [x] Constants + dialog defaults (open-at-Returned and switch-to-Returned)
- [x] `tsc` / ESLint
- [x] Local browser verification (Docker DB only) — **6/6**:
  - [x] Table `RETURNED…` → **Kanina + Akash Enterprises pre-selected**; Received By offers only Akash Enterprises + Other… — R1a
  - [x] One click sends `location: "Kanina"`, `receivedBy: "Akash Enterprises"`; both saved on the tracking row — R1b
  - [x] Other… location "Mahendragarh" sent and saved — R2
  - [x] Other… Received By "Ramesh" sent and saved (location still Kanina) — R3
  - [x] Order Details: Returned → both defaults; → Delivered → customer + address (no Received Back At); → Returned → defaults again; saved — R4
  - [x] Delivered unchanged: Received By = customer (customer + Other…), Delivered At = address — R5

## Production release + test (2026-10-04)

Pushed `a7dde2b` + `1f199b4` to `origin/main` at 19:15. Frontend-only. Vercel served
the new bundle **`index-BNd2Oy45.js`** (contains "Akash Enterprises") at 19:16:25.

**Test: the cleanup's final Returned step done through the real dialog.** The same
script passed 6/6 as a local dry run first. Browser saves were allowed only for the
two test orders' delivery status.

- **Account:** `test@gmail.com`.
- **Test customer:** **#193 "TEST Phase26 — delete me"** (phone 9000022026).
- **Orders**, 1 × FEED SAMPLE 500G (#36) each:
  - **ORD-2026-000219 (#221)** — the one tested.
  - **ORD-2026-000220 (#222)** — kept open so the account could still read the
    tracking row after the first one reached Returned (Phase 19 unassigns at the
    last finished order); returned via the API at the end.
- **Stock: 99 before.**

| # | Check | Result |
|---|---|---|
| P1 | Returned dialog on production: **Received Back At = Kanina, Received By = Akash Enterprises** | ✅ |
| P2 | One click → exactly one PATCH with `location: "Kanina"`, `receivedBy: "Akash Enterprises"` | ✅ |
| P3 | Tracking row: RETURNED, location **"Kanina"**, receivedBy **"Akash Enterprises"** | ✅ |
| P4 | Stock restored by exactly 1 for that order (97 → 98) | ✅ |
| G | No browser write outside the test orders | ✅ |
| CLEAN | Second order walked to RETURNED too; **stock 99 → 99** | ✅ |

**Acceptance criterion met:** Returned → one-click save → tracking row contains
Kanina + Akash Enterprises, and stock is restored.

No real customer orders were read or modified.

**Admin cleanup pending:** move ORD-2026-000219, ORD-2026-000220 and customer
#193 "TEST Phase26 — delete me" to Trash.
