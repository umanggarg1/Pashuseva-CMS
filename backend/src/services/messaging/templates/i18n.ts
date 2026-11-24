import type { OrderPaymentKind } from '../../../utils/paymentSummary';
import { formatRupees } from './format';

// Phase 32 B4: the ONLY translated words that go into template PARAMETERS. Everything
// else in a parameter (names, products, order numbers, units, amounts) is inserted
// exactly as stored, in English, for both languages (§4.3).
//
// Status of the Hindi strings:
//   - {{5}} payment method: FINAL — decided by the user (Q12, 2026-11-24). Exact text.
//   - {{6}} {{7}} {{8}} and the "+N more" suffix: DRAFT — to be approved by the user in
//     B6 together with the Hindi template text, before anything is submitted to Meta.

export type Lang = 'EN' | 'HI';

/** {{5}} Payment method — Q12, exact, do not edit without the user's approval. */
export const PAYMENT_METHOD: Record<Lang, Record<OrderPaymentKind, string>> = {
  EN: {
    UNPAID: 'Cash on Delivery',
    PARTIAL: 'Part prepaid, balance due on delivery',
    PAID: 'Prepaid',
    FREE: 'Free order',
    REFUNDED: '—', // defensive; no flow produces REFUNDED
  },
  HI: {
    UNPAID: 'कैश ऑन डिलीवरी',
    PARTIAL: 'कुछ एडवांस, बाकी डिलीवरी पर।',
    PAID: 'पूरा भुगतान हो चुका है',
    FREE: 'निःशुल्क ऑर्डर',
    REFUNDED: '—',
  },
};

/** {{6}} Payment status. EN final per §4.2; HI = DRAFT (B6). */
export const PAYMENT_STATUS: Record<Lang, Record<OrderPaymentKind, string>> = {
  EN: { UNPAID: 'Unpaid', PARTIAL: 'Partially paid', PAID: 'Paid', FREE: 'Paid', REFUNDED: 'Refunded' },
  HI: { UNPAID: 'भुगतान बाकी', PARTIAL: 'आंशिक भुगतान', PAID: 'भुगतान हो चुका', FREE: 'भुगतान हो चुका', REFUNDED: 'रिफंड' },
};

/** {{7}} Amount line (a whole line, so its label can change). EN per §4.2; HI = DRAFT (B6). */
export function amountLine(
  lang: Lang,
  kind: OrderPaymentKind,
  amounts: { total: number; paid: number; due: number }
): string {
  const due = `₹${formatRupees(amounts.due)}`;
  const paid = `₹${formatRupees(Math.max(amounts.paid, 0))}`;
  const total = `₹${formatRupees(amounts.total)}`;
  if (lang === 'EN') {
    switch (kind) {
      case 'UNPAID': return `Amount to pay on delivery: ${due}`;
      case 'PARTIAL': return `Paid ${paid}, balance due on delivery: ${due}`;
      case 'PAID': return `Amount paid: ${total}`;
      case 'FREE': return 'Nothing to pay';
      case 'REFUNDED': return 'Please contact us for payment details';
    }
  }
  switch (kind) {
    case 'UNPAID': return `डिलीवरी पर देय राशि: ${due}`;
    case 'PARTIAL': return `${paid} जमा, डिलीवरी पर बाकी: ${due}`;
    case 'PAID': return `भुगतान की गई राशि: ${total}`;
    case 'FREE': return 'कोई भुगतान नहीं';
    case 'REFUNDED': return 'भुगतान की जानकारी के लिए हमसे संपर्क करें';
  }
}

/** {{8}} when the order has no Article No. yet (Q7). HI = DRAFT (B6). */
export const TRACKING_FALLBACK: Record<Lang, string> = {
  EN: 'Will be shared soon',
  HI: 'जल्द ही साझा किया जाएगा',
};

/** Suffix when the item list is cut to fit. HI = DRAFT (B6). */
export function moreItems(lang: Lang, n: number): string {
  return lang === 'EN' ? `… +${n} more item${n === 1 ? '' : 's'}` : `… +${n} और उत्पाद`;
}
