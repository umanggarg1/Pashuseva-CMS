import prisma, { PrismaClientOrTx } from '../lib/prisma';
import { Prisma } from '../generated/prisma/client';
import type { CustomerStatus } from '../generated/prisma/enums';

interface PhoneInput {
  phone: string;
  label?: string;
  isPrimary: boolean;
}

interface AddressInput {
  line1: string;
  line2?: string;
  city: string;
  district?: string;
  state: string;
  pincode: string;
  landmark?: string;
  country?: string;
}

export const customerRepository = {
  // Every one of these excludes trashed customers by default — Trash (Phase 3
  // addendum) has its own dedicated findTrashed/restore/permanentDelete below, so
  // nothing here needs an opt-out. A trashed customer is never editable, assignable,
  // or usable for a new order — restore it first.
  async findMany(
    where: Prisma.CustomerWhereInput,
    options: { skip: number; take: number; orderBy: Prisma.CustomerOrderByWithRelationInput }
  ) {
    const whereActive = { ...where, deletedAt: null };
    const [data, total] = await Promise.all([
      prisma.customer.findMany({
        where: whereActive,
        include: {
          phones: true,
          addresses: true,
          assignedEmployee: { select: { id: true, name: true } },
          assignedManager: { select: { id: true, name: true } },
        },
        skip: options.skip,
        take: options.take,
        orderBy: options.orderBy,
      }),
      prisma.customer.count({ where: whereActive }),
    ]);
    return { data, total };
  },

  findById(id: number) {
    return prisma.customer.findFirst({
      where: { id, deletedAt: null },
      include: {
        phones: true,
        addresses: true,
        // Payments nested per order (Phase 13) so Customer Detail can compute
        // Paid/Outstanding the same way it already computes Total Purchases — one
        // fetch, derived client-side, no separate aggregation endpoint.
        orders: { include: { payments: { select: { amount: true } } } },
        assignedEmployee: { select: { id: true, name: true } },
        assignedManager: { select: { id: true, name: true } },
      },
    });
  },

  findAssignmentById(id: number) {
    return prisma.customer.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, assignedEmployeeId: true, assignedManagerId: true },
    });
  },

  create(
    data: {
      name: string;
      email?: string;
      notes?: string;
      createdById?: number;
      assignedManagerId?: number;
      assignedEmployeeId?: number;
      phones: PhoneInput[];
      address?: AddressInput;
    },
    client: PrismaClientOrTx = prisma
  ) {
    return client.customer.create({
      data: {
        name: data.name,
        email: data.email,
        notes: data.notes,
        createdById: data.createdById,
        assignedManagerId: data.assignedManagerId,
        assignedEmployeeId: data.assignedEmployeeId,
        phones: { create: data.phones },
        ...(data.address && { addresses: { create: data.address } }),
      },
      include: { phones: true, addresses: true },
    });
  },

  update(
    id: number,
    data: {
      name?: string;
      email?: string;
      notes?: string;
      phones?: PhoneInput[];
      address?: AddressInput;
    }
  ) {
    return prisma.$transaction(async (tx) => {
      if (data.phones) {
        await tx.customerPhone.deleteMany({ where: { customerId: id } });
        await tx.customerPhone.createMany({
          data: data.phones.map((phone) => ({ ...phone, customerId: id })),
        });
      }

      if (data.address) {
        await tx.customerAddress.deleteMany({ where: { customerId: id } });
        await tx.customerAddress.create({ data: { ...data.address, customerId: id } });
      }

      return tx.customer.update({
        where: { id },
        data: { name: data.name, email: data.email, notes: data.notes },
        include: { phones: true, addresses: true },
      });
    });
  },

  updateStatus(id: number, status: CustomerStatus) {
    return prisma.customer.update({ where: { id }, data: { status } });
  },

  assign(customerId: number, employeeId: number, managerId: number | null) {
    return prisma.customer.update({
      where: { id: customerId },
      data: { assignedEmployeeId: employeeId, assignedManagerId: managerId },
    });
  },

  bulkAssign(customerIds: number[], employeeId: number, managerId: number | null) {
    return prisma.customer.updateMany({
      where: { id: { in: customerIds } },
      data: { assignedEmployeeId: employeeId, assignedManagerId: managerId },
    });
  },

  // Clears only the Employee assignment, deliberately leaving assignedManagerId as-is —
  // the customer stays within the Manager's team scope (visible, shown as "Unassigned"
  // to a specific Employee) rather than dropping into an Admin-only void. See the
  // customer list mockup in phases.md Phase 4 §1, which shows "Unassigned" as a normal
  // row state, not a hidden one.
  unassign(customerId: number) {
    return prisma.customer.update({
      where: { id: customerId },
      data: { assignedEmployeeId: null },
    });
  },

  recordActivity(
    customerId: number,
    activity: string,
    createdById: number,
    client: PrismaClientOrTx = prisma
  ) {
    return client.customerActivity.create({
      data: { customerId, activity, createdById },
    });
  },

  findActivity(customerId: number) {
    return prisma.customerActivity.findMany({
      where: { customerId },
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  },

  // Trash (Phase 3 addendum) — a separate, deliberately narrow set of queries/writes
  // that only ever touch already-trashed rows, mirroring findMany/findById above but
  // with the opposite deletedAt filter.
  findTrashedById(id: number) {
    return prisma.customer.findFirst({ where: { id, deletedAt: { not: null } } });
  },

  findTrashed() {
    return prisma.customer.findMany({
      where: { deletedAt: { not: null }, purgedAt: null },
      include: { deletedBy: { select: { id: true, name: true } } },
      orderBy: { deletedAt: 'desc' },
    });
  },

  softDelete(id: number, deletedById: number, deletionExpiresAt: Date) {
    return prisma.customer.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById, deletionExpiresAt },
    });
  },

  restore(id: number) {
    return prisma.customer.update({
      where: { id },
      data: { deletedAt: null, deletedById: null, deletionExpiresAt: null },
    });
  },

  // Not a real DELETE FROM — Order.customerId is ON DELETE RESTRICT, so any customer
  // with order history can't be dropped at the database level at all. Anonymizes in
  // place instead: personal fields scrubbed, phones/addresses (genuinely nothing left
  // to keep once the customer is gone) removed outright, the row itself kept so every
  // Order still referencing it resolves to something instead of breaking.
  permanentDelete(id: number) {
    return prisma.$transaction(async (tx) => {
      await tx.customerPhone.deleteMany({ where: { customerId: id } });
      await tx.customerAddress.deleteMany({ where: { customerId: id } });
      return tx.customer.update({
        where: { id },
        data: {
          name: `Deleted Customer #${id}`,
          email: null,
          notes: null,
          purgedAt: new Date(),
        },
      });
    });
  },

  // Every trashed customer whose deletionExpiresAt has passed — the daily purge
  // sweep's input set.
  findExpired() {
    return prisma.customer.findMany({
      where: { deletedAt: { not: null }, purgedAt: null, deletionExpiresAt: { lte: new Date() } },
      select: { id: true, name: true },
    });
  },
};
