import prisma from '../lib/prisma';

export const customerNoteRepository = {
  create(customerId: number, note: string, createdById: number) {
    return prisma.customerNote.create({
      data: { customerId, note, createdById },
    });
  },

  listForCustomer(customerId: number) {
    return prisma.customerNote.findMany({
      where: { customerId },
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  },
};
