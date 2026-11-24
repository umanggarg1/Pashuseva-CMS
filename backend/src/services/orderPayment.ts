import prisma, { PrismaClientOrTx } from '../lib/prisma';
import { paymentRepository } from '../repositories/payment.repository';
import type { PaymentStatus } from '../generated/prisma/enums';
import { summarizeOrderPayment, OrderPaymentSummary } from '../utils/paymentSummary';
import logger from '../logger';

export type { OrderPaymentKind, OrderPaymentSummary } from '../utils/paymentSummary';

// Phase 32 B0 (PHASE32_TODO.md §19.6): the ONE place an order's payment position is
// worked out. The parcel label, the WhatsApp dispatch message and the resend preview
// all read it from here — none of them calculate amounts on their own, so they can
// never disagree. The pure rules live in utils/paymentSummary.ts.

/**
 * Reads the net paid amount from the payment ledger (inside the caller's transaction
 * when one is passed) and combines it with the order's total and derived status.
 */
export async function getOrderPaymentSummary(
  order: { id: number; total: number; paymentStatus: PaymentStatus },
  client: PrismaClientOrTx = prisma
): Promise<OrderPaymentSummary> {
  const paid = await paymentRepository.sumForOrder(order.id, client);
  const summary = summarizeOrderPayment(order.total, paid, order.paymentStatus);
  if (summary.overpaid > 0) {
    logger.warn(
      `[orderPayment] order ${order.id} is overpaid by ${summary.overpaid} (total ${order.total}, paid ${paid}); showing due 0`
    );
  }
  return summary;
}
