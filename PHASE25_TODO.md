# Phase 25 — Delivered: payment defaults to Paid + COD

**Status: implemented and verified locally 2026-10-04 (frontend only).
Never run against production. Not committed.**

- **Browser: 9/9** on a throwaway Docker Postgres (`crm-phase25-test`, `localhost:55432`),
  with the actual request bodies captured.
- The Phase 24 backend suite still passes 23/23 (backend unchanged).
- `tsc` and ESLint clean.

## The request, as given

When marking an order **Delivered**, the dialog's Payment Details should start at
**Paid + COD** instead of **Unpaid**. Staff can still switch to Unpaid or Online.
Backend unchanged: a payment is recorded only when `paymentCollected: true`.

Clicking **Mark as Delivered** without touching anything should send:

```json
{ "deliveryStatus": "DELIVERED", "paymentCollected": true, "paymentMethod": "CASH" }
```

## What changes

| | Before | After |
|---|---|---|
| Payment Status default | Unpaid | **Paid** |
| Payment Method default | COD (shown only after choosing Paid) | **COD** (shown at once) |
| One-click "Mark as Delivered" | records no payment | records a **COD payment for the remaining balance** |

- **File:** `frontend/src/components/ChangeDeliveryStatusDialog.tsx` — the starting
  value `UNPAID` → `PAID` (initial state + reset on open), plus the comment.
- **Same dialog everywhere:** the Orders table's `DELIVERED…` and Order Details'
  Change Status.

**Unchanged:**
- The payment section (and therefore `paymentCollected`) appears only when the
  user has **`payment:create`** and the order **isn't already Paid**. Otherwise
  nothing payment-related is sent, as before.
- The backend records **only the remaining balance** (never double-collects).
- The backend requires `paymentMethod` when `paymentCollected` is true.

## Decision note

This reverses the Phase 22/23-era rule "recording a payment is an explicit choice,
never assumed". Accepted trade-off: COD-on-delivery is the normal case, but an
accidental one-click Delivered on an order that was actually unpaid now records a
payment, which must then be reversed by someone with `payment:edit`.

## TODO checklist

- [x] Default Paid + COD in the dialog (initial + reset)
- [x] `tsc` / ESLint
- [x] Local browser verification (Docker DB only) — **9/9**:
  - [x] Delivered dialog opens with **Paid + COD selected** (table) — D1a
  - [x] One click sends `{"deliveryStatus":"DELIVERED","paymentCollected":true,"paymentMethod":"CASH"}` — D1b
  - [x] Exactly one CASH payment of the full ₹150; order DELIVERED + PAID — D1c
  - [x] Online → `paymentMethod: "ONLINE"`, one ONLINE payment — D2
  - [x] Unpaid → method buttons hidden, `paymentCollected: false` (no method), no payment, still Unpaid — D3
  - [x] Partly paid (₹50 of ₹150) → dialog shows ₹100 remaining; only ₹100 CASH recorded — D4
  - [x] Already Paid → no Payment Details; no `paymentCollected` sent; no extra payment — D5
  - [x] Employee without `payment:create` → no Payment Details; no `paymentCollected` sent; no payment — D6
  - [x] Order Details' own Change Status → Delivered also defaults to Paid + COD — D7
