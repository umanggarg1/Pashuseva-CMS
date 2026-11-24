/**
 * Standalone verification for Phase 32 B0: summarizeOrderPayment (the pure core of
 * getOrderPaymentSummary) against a table of every payment situation the CRM can be
 * in — including the defensive ones (overpaid, refunded) that no flow produces today.
 *
 * This project has no test runner, so this is a plain script:
 *     npx ts-node src/utils/paymentSummary.verify.ts
 * Exits 0 when every case matches, 1 (listing the mismatches) otherwise.
 */
import { summarizeOrderPayment, OrderPaymentKind } from './paymentSummary';
import type { PaymentStatus } from '../generated/prisma/enums';

type Case = {
  name: string;
  total: number;
  paid: number;
  status: PaymentStatus;
  expect: { due: number; overpaid: number; kind: OrderPaymentKind };
};

const cases: Case[] = [
  { name: 'unpaid (Cash on Delivery)', total: 1250, paid: 0, status: 'PENDING', expect: { due: 1250, overpaid: 0, kind: 'UNPAID' } },
  { name: 'part paid', total: 1250, paid: 500, status: 'PARTIAL', expect: { due: 750, overpaid: 0, kind: 'PARTIAL' } },
  { name: 'fully paid', total: 1250, paid: 1250, status: 'PAID', expect: { due: 0, overpaid: 0, kind: 'PAID' } },
  { name: 'free order (Phase 31, stored PAID)', total: 0, paid: 0, status: 'PAID', expect: { due: 0, overpaid: 0, kind: 'FREE' } },
  { name: 'free order even if status were PENDING', total: 0, paid: 0, status: 'PENDING', expect: { due: 0, overpaid: 0, kind: 'FREE' } },
  // A reversal is a negative ledger row, so the caller passes the NET sum.
  { name: 'payment fully reversed (net 0)', total: 1200, paid: 0, status: 'PENDING', expect: { due: 1200, overpaid: 0, kind: 'UNPAID' } },
  { name: 'reversed then part re-paid (net 300)', total: 1200, paid: 300, status: 'PARTIAL', expect: { due: 900, overpaid: 0, kind: 'PARTIAL' } },
  { name: 'REFUNDED (defensive)', total: 1200, paid: 0, status: 'REFUNDED', expect: { due: 1200, overpaid: 0, kind: 'REFUNDED' } },
  { name: 'overpaid (blocked by the app; clamp anyway)', total: 1000, paid: 1200, status: 'PAID', expect: { due: 0, overpaid: 200, kind: 'PAID' } },
  { name: 'net negative ledger (defensive)', total: 1000, paid: -50, status: 'PENDING', expect: { due: 1050, overpaid: 0, kind: 'UNPAID' } },
  { name: 'decimal total', total: 1234.5, paid: 0, status: 'PENDING', expect: { due: 1234.5, overpaid: 0, kind: 'UNPAID' } },
  { name: 'decimal part payment', total: 999.99, paid: 499.99, status: 'PARTIAL', expect: { due: 500, overpaid: 0, kind: 'PARTIAL' } },
];

const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;
let failures = 0;
for (const c of cases) {
  const got = summarizeOrderPayment(c.total, c.paid, c.status);
  const ok =
    close(got.due, c.expect.due) &&
    close(got.overpaid, c.expect.overpaid) &&
    got.kind === c.expect.kind &&
    got.total === c.total &&
    got.paid === c.paid &&
    got.due >= 0 &&
    got.overpaid >= 0;
  if (!ok) {
    failures++;
    console.log(`FAIL  ${c.name}\n      expected ${JSON.stringify(c.expect)}\n      got      ${JSON.stringify(got)}`);
  } else {
    console.log(`PASS  ${c.name}`);
  }
}
console.log(`\n${cases.length - failures}/${cases.length} payment-summary cases passed`);
process.exit(failures ? 1 : 0);
