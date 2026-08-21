# Phase 13 — Invoice & Payment Management

## Status: done (2026-08-20)

Spec pasted 2026-08-20, framed by the user as the recommended next phase (Phase 10
Notifications and Phase 12 Suppliers & Purchases both stay deferred; nothing in this
phase depended on either). Curated first, built on a separate explicit "start building
phase 13" instruction, same two-step pattern as Phase 11.

## The real shift this phase makes

`Order.paymentStatus` already exists (`PENDING`/`PARTIAL`/`PAID`/`REFUNDED`) and is
already editable — but only as a bare manual dropdown
(`PATCH /orders/:id/payment`) with no amount tracking behind it at all. That endpoint
was itself a Phase 6 gap-fix ("Payment Status had no update control anywhere in the
frontend" — see `about.md`), not a deliberately-defended design the way manual
order/delivery status was, so this isn't a conflict to resolve like Phase 11's §8 —
it's this phase's whole point: **replace the bare status flag with a real append-only
`Payment` ledger, and compute status from `SUM(payments.amount)` instead of letting
anyone just declare "Paid."** The spec's own §2 says this explicitly ("calculated from
payment records rather than manually entered whenever possible"). When this is built,
the existing `PATCH /orders/:id/payment` route/UI gets replaced, not kept alongside
the new one — two ways to set payment status would be a real bug source.

## Reusable patterns already in this codebase (for whoever builds this)

- **`Payment` should be an append-only ledger table**, same shape as `StockHistory`
  (Phase 8) and `DeliveryTracking` (Phase 7): one row per event, linked to `Order`,
  `createdById`/`createdAt`, never mutated in place. §14's "correction, not edit" rule
  is exactly `StockHistory`'s already-established pattern of recording a reversal
  entry rather than rewriting history.
- **Invoice number generation** mirrors `orderRepository.nextOrderNumber` exactly
  (count existing invoices this year, `INV-${year}-${padded count}`) — same pattern,
  new prefix.
- **Print Invoice reuses the Print Order infrastructure** built for Article Number/
  delivery: the `.print-only`/`.print-hide` CSS in `tailwind.css` and the
  `PrintableOrder` pattern in `OrderDetail.tsx` — this becomes a second print-only
  block (or the existing one gains payment/invoice fields), not new print
  infrastructure.
- **CSV export reuses `lib/exportCsv.ts`** (Phase 9) for the Payments report — no new
  export mechanism.
- **The Payments Reports tab reuses `Reports.tsx`'s existing tab-switcher pattern**
  (Sales/Orders/Customers/Products already there) — a fifth tab, not a new page shape.
- **The "estimated delivery charges never enter a total" rule (just built) extends
  directly to this phase**: it must stay excluded from the invoice total, the payable
  amount, and the outstanding calculation — the same rule, one more place it applies.
  Worth a shared, explicit comment/constant wherever these totals are computed so this
  doesn't drift (`orderMetrics.ts` from Phase 9 is the natural home for a
  `payableAmount` helper, alongside the existing `salesEligibleFilter`).
- **Customer Detail's purchase-summary cards** (Phase 11, already fixed to correctly
  exclude cancelled orders) are where Paid/Outstanding get added — extending an
  existing section, not a new one.
- **Dashboard summary** (`dashboard.service.ts`, one consolidated endpoint per Phase
  9's own performance rule) is where Total Sales/Outstanding/Today's Payments get
  added — same endpoint, more fields, not a new API call.

## New work — all done

1. **DONE — `Payment` model.** `id, orderId, amount, method, referenceNumber?,
   paymentDate, notes?, reversesPaymentId?, createdById, createdAt`. Migration
   `20260820113000_invoice_and_payments`, hand-written (Prisma refused to run
   non-interactively — same class of warning as every prior data-affecting migration
   in this project) — also backfilled `invoiceNumber` for all pre-existing orders and
   one `Payment` row for each order that was already manually marked PAID under the
   old dropdown, so migrating didn't silently revert real historical data to Unpaid.
2. **DONE — `Order.invoiceNumber`.** Generated alongside `orderNumber` at creation
   time (`orderRepository.nextInvoiceNumber`, same per-year sequential pattern) — no
   "not yet generated" state anywhere.
3. **DONE — backend-enforced payment validation.** Re-sums the ledger *inside* the
   transaction before checking against the remaining balance (not a value read before
   the transaction started), same race-safety spirit as the stock guard. Live-verified
   an overpayment is rejected with the exact remaining balance in the error message.
4. **DONE — `CARD` added to `PaymentMethod`.**
5. **DONE — computed `paymentStatus`.** `paidStatusFor()` in `order.service.ts` —
   Unpaid/Partially Paid/Paid derived from `SUM(payments.amount)` vs. total, written
   after every add/reverse, never settable directly (the old
   `PATCH /orders/:id/payment` route/schema/repository method/frontend dropdown were
   all removed, not kept alongside the new system).
6. **DONE — correction, not edit-in-place.** Reversal creates a negative `Payment` row
   referencing the original via `reversesPaymentId`; guarded against reversing an
   already-reversed payment and against reversing a reversal itself — both verified
   live (400 in both cases).
7. **DONE — `GET/POST /orders/:id/payments`, `POST /orders/:id/payments/:paymentId/reverse`.**
   New `PaymentCard` on Order Details: computed status, Paid/Remaining, Payment
   History (each row showing amount/method/date/reference/notes/who, with a Reverse
   action), `[+ Add Payment]` dialog.
8. **DONE — Invoice section + Print Invoice.** Folded into the same `PaymentCard`
   (invoice number/date, `[Print Invoice]`) rather than a separate card — they're both
   "money" information about the order. `PrintableOrder` (Phase 7's print
   infrastructure) now shows Invoice #, Paid, and Balance alongside the existing
   Total; Estimated Delivery Charges stays excluded from all of it.
9. **DONE — Customer Detail Paid/Outstanding.** `customerRepository.findById` now
   nests `payments` under each order (same "one fetch, derive client-side" pattern
   already used for Total Purchases); Paid/Outstanding computed the same way an
   order's own status is — summed from the ledger, never a separately-drifting figure.
10. **DONE — Dashboard Outstanding + Today's Payments.** Added to the existing
    consolidated `/dashboard/summary` endpoint and the Sales Summary card — no new API
    call. `outstandingTotal()` derives fresh from `Order.total` minus `SUM(payments)`
    every time, same "never cache what you can derive" principle as everything else
    Phase 9 already established.
11. **DONE — Payments Reports tab.** Fifth tab, Total Collected + by-method
    breakdown, Date/Method/Employee filters, Export CSV via the existing utility.
12. **DONE — `payment:view`/`payment:create`/`payment:edit` permissions.** Not in
    `DEFAULT_EMPLOYEE_PERMISSIONS`. Live-verified the full three-way split: an
    Employee with neither got 403 on both view and add; granted view+create, add
    succeeded but reverse (needs edit) still 403.

## Explicitly not doing

Per the spec's own repeated instruction: no payment gateway integration (this phase
records payments, it doesn't process them online); no complex accounting/ledger
system beyond the simple append-only `Payment` table; no free-edit of historical
payments (correction-only, per §14); no separate financial dashboard (a couple of
cards on the existing one, per §17's own "don't create a separate financial dashboard
yet"). "Outstanding" used throughout, not "Debt"/"Due," per the spec's own explicit
wording preference (§16).

## Verified

Backend `tsc`/`eslint` clean (0 errors/warnings), frontend `tsc`/`eslint`/`vite build`
clean (0 errors, same 5 pre-existing warnings). Live-tested against the real
database: partial payment → overpayment correctly rejected with the exact remaining
balance → paying the exact remainder flips status to Paid; reversal correctly
restores balance and blocks double-reversal and reversal-of-a-reversal; dashboard
Outstanding/Today's Payments and the Payments report's totals/by-method breakdown
matched hand-computed expected values exactly; the full `view`/`create`/`edit`
permission split enforced end-to-end with a throwaway Employee account. All test
payments were reversed and test accounts/assignments cleaned up afterward — the one
migration backfill (2 orders' historical PAID status) is real data, kept
intentionally.

## Follow-up, 2026-08-20 — Add Payment dialog: Full Paid vs. Partial

Refined the Add Payment dialog on request: it now asks Full Paid or Partial first,
rather than going straight to a bare amount field. Full Paid pays off exactly the
remaining balance (shown read-only, not editable — there's nothing to type); Partial
reveals the manual amount input, unchanged from before. Frontend-only — posts the
same request shape to the same already-verified `POST /orders/:id/payments`
endpoint, so no backend change or re-verification of the payment/validation logic was
needed. `tsc`/`eslint`/`vite build` all clean.
