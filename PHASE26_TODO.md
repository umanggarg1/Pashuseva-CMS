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
