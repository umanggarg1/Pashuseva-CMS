import prisma from '../lib/prisma';

export const orderNoteRepository = {
  create(orderId: number, note: string, createdById: number) {
    return prisma.orderNote.create({
      data: { orderId, note, createdById },
    });
  },

  listForOrder(orderId: number) {
    return prisma.orderNote.findMany({
      where: { orderId },
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  },
};
