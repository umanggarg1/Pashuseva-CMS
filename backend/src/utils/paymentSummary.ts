import type { PaymentStatus } from '../generated/prisma/enums';

// Phase 32 B0 (PHASE32_TODO.md §19.6): the pure core of the ONE shared payment
// calculation. No database access here, so it can be verified exhaustively
// (paymentSummary.verify.ts). services/orderPayment.ts reads the ledger and calls it;
// the parcel label, WhatsApp dispatch message and resend preview all go through that.
//
// Facts this relies on (checked in A0 against the real data):
//   - the Payment table is the ledger; a reversal is a separate NEGATIVE row
//     (reversesPaymentId), so SUM(amount) is already the net amount paid;
//   - Order.paymentStatus is derived from that ledger by orderService.paidStatusFor
//     and is the source of truth for the wording ("Unpaid" / "Partially paid" /
//     "Paid"), exactly as the parcel label already treated it;
//   - REFUNDED is never produced by any flow today — handled defensively only;
//   - overpayment is blocked at create / addPayment / edit, but `due` is clamped at 0
//     anyway so a negative balance can never be shown.
//
// Amounts are returned exactly as given (no rounding) — formatting is the caller's
// job, so the parcel label's existing output stays byte-for-byte the same.

export type OrderPaymentKind =
  | 'FREE' // total <= 0 (Phase 31 free order; stored as PAID)
  | 'UNPAID' // PENDING — nothing paid yet (Cash on Delivery)
  | 'PARTIAL' // part paid, balance due on delivery
  | 'PAID' // fully paid
  | 'REFUNDED'; // defensive: no current flow produces it

export interface OrderPaymentSummary {
  total: number;
  /** Net paid: SUM of all Payment rows, reversals (negative rows) included. */
  paid: number;
  /** max(total − paid, 0) — never negative. */
  due: number;
  /** max(paid − total, 0) — should always be 0; logged by the caller if not. */
  overpaid: number;
  kind: OrderPaymentKind;
}

export function summarizeOrderPayment(
  total: number,
  paid: number,
  paymentStatus: PaymentStatus
): OrderPaymentSummary {
  const due = Math.max(total - paid, 0);
  const overpaid = Math.max(paid - total, 0);
  let kind: OrderPaymentKind;
  if (total <= 0) kind = 'FREE';
  else if (paymentStatus === 'PAID') kind = 'PAID';
  else if (paymentStatus === 'PARTIAL') kind = 'PARTIAL';
  else if (paymentStatus === 'REFUNDED') kind = 'REFUNDED';
  else kind = 'UNPAID';
  return { total, paid, due, overpaid, kind };
}
