# Phase 25 — Delivered: payment defaults to Paid + COD

**Status: released and smoke-tested on production 2026-10-04 (see "Production
release + smoke test" at the end). Test data cleaned up.**

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

## Production release + smoke test (2026-10-04)

Pushed `0720148` + `4fe8736` to `origin/main` at 19:06. Frontend-only (backend
unchanged), so deployment was confirmed by Vercel serving a **new bundle,
`index-CLpC-3Ie.js`** (was `index-ESog9Mnh.js`) at 19:06:46. The check below
then proved the new default is live.

**Smoke test on one dedicated test order.** The same script passed 6/6 as a local
dry run first. The browser was blocked from **any** write; Delivered was never
saved.

- **Account:** `test@gmail.com` (has `payment:create`, so the payment section shows).
- **Test customer:** **#192 "TEST Phase25 — delete me"** (phone 9000022025).
- **Order:** **ORD-2026-000218 (#220)**, 1 × FEED SAMPLE 500G (#36).
- **Stock recorded before: 99.**

| # | Check | Result |
|---|---|---|
| S1 | Test order moved to Out for Delivery (API) | ✅ |
| S2 | **Delivered… dialog on production: Paid selected, COD selected** (Unpaid / Online not); balance ₹50 and address shown | ✅ |
| S3 | **Cancel: no request attempted, no payment created**, still Out for Delivery + Unpaid | ✅ |
| CLEAN | No payment on the test order; walked Return Pending → Return In Transit → Returned; **stock 99 → 99** | ✅ |
| G | The browser attempted no write at all | ✅ |

**Acceptance criterion met:** opening the Delivered dialog → Paid selected → COD
selected → Cancel creates no payment.

No real customer orders were read or modified.

**Admin cleanup: done (2026-10-04).** ORD-2026-000218 and customer #192
"TEST Phase25 — delete me" were moved to Trash. On the first check the customer
still returned 403 (not yet trashed) and was then trashed. Verified read-only from
`test@gmail.com`: `/orders/220` → 404 "Order not found"; `/customers/192` → 404
"Customer not found"; FEED SAMPLE 500G stock still 99.
