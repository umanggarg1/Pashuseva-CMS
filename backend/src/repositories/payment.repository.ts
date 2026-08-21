import prisma, { PrismaClientOrTx } from '../lib/prisma';
import type { PaymentMethod } from '../generated/prisma/enums';

export const paymentRepository = {
  create(
    data: {
      orderId: number;
      amount: number;
      method: PaymentMethod;
      referenceNumber?: string;
      paymentDate?: Date;
      notes?: string;
      reversesPaymentId?: number;
      createdById?: number;
    },
    client: PrismaClientOrTx = prisma
  ) {
    return client.payment.create({ data });
  },

  findById(id: number, client: PrismaClientOrTx = prisma) {
    return client.payment.findUnique({ where: { id } });
  },

  findByOrder(orderId: number) {
    return prisma.payment.findMany({
      where: { orderId },
      include: {
        createdBy: { select: { id: true, name: true } },
        reversesPayment: { select: { id: true, amount: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  },

  // Race-safe total: reads straight from the ledger inside whichever transaction the
  // caller is already in, so a payment being validated against "remaining balance"
  // always sees every payment committed so far in that same transaction.
  async sumForOrder(orderId: number, client: PrismaClientOrTx = prisma) {
    const result = await client.payment.aggregate({
      where: { orderId },
      _sum: { amount: true },
    });
    return result._sum.amount ?? 0;
  },

  // Has this payment already been reversed? Prevents reversing the same payment twice.
  async findReversalOf(paymentId: number, client: PrismaClientOrTx = prisma) {
    return client.payment.findFirst({ where: { reversesPaymentId: paymentId } });
  },
};
