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
          assignedEmployees: { include: { employee: { select: { id: true, name: true } } } },
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
        assignedEmployees: { include: { employee: { select: { id: true, name: true } } } },
        assignedManager: { select: { id: true, name: true } },
      },
    });
  },

  // Phase 18/19: also selects every assigned Employee's own set of Managers (via the
  // EmployeeManager join) — needed so a Manager can see/manage a customer that an
  // Employee reporting to them created without anyone explicitly picking a single
  // manager (see utils/dataScope.ts's hasCustomerDataAccess). Phase 19: a customer
  // can have several assigned Employees now, not just one — the Manager fallback
  // fires if *any* of them reports to the acting Manager.
  findAssignmentById(id: number) {
    return prisma.customer.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        assignedManagerId: true,
        assignedEmployees: {
          select: {
            employeeId: true,
            employee: { select: { managedBy: { select: { managerId: true } } } },
          },
        },
      },
    });
  },

  // Phase 19: the order-creation-time customer search. Deliberately a lean, fixed
  // shape (name/phone/city/currently-assigned-employees only) — never the full
  // profile (notes, order history, addresses beyond the primary city) — this is the
  // one code path both a broad ("search all") and scoped search share, so nothing
  // ever leaks a fuller record through it regardless of who's calling. See
  // PHASE19_TODO.md §A / design note 8.
  searchForOrder(where: Prisma.CustomerWhereInput, take: number) {
    return prisma.customer.findMany({
      where: { ...where, deletedAt: null },
      select: {
        id: true,
        name: true,
        phones: { select: { phone: true, isPrimary: true } },
        addresses: { select: { city: true }, take: 1 },
        assignedEmployees: { select: { employee: { select: { id: true, name: true } } } },
      },
      orderBy: { name: 'asc' },
      take,
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
        ...(data.assignedEmployeeId !== undefined && {
          assignedEmployees: { create: [{ employeeId: data.assignedEmployeeId }] },
        }),
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

  // Phase 19: Customer.status is fully derived from order history now — this is the
  // only write left, called exclusively by utils/customerAutomation.ts's
  // recalculateCustomerState (order.service.ts's create/updateDeliveryStatus/cancel),
  // never directly from a request body. Takes a tx client since it always runs
  // inside one of those methods' existing $transaction.
  setStatus(id: number, status: CustomerStatus, client: PrismaClientOrTx = prisma) {
    return client.customer.update({ where: { id }, data: { status } });
  },

  // Phase 19: the automatic assignment that happens when an Employee creates an
  // order for a customer (PHASE19_TODO.md §B) — deliberately only touches the join
  // table, unlike assign() below, which also overwrites assignedManagerId as part of
  // a *manual* (re)assignment action. Auto-assignment on order creation is never
  // supposed to change who the customer's Manager is.
  async autoAssignEmployee(customerId: number, employeeId: number, client: PrismaClientOrTx = prisma) {
    await client.customerAssignedEmployee.upsert({
      where: { customerId_employeeId: { customerId, employeeId } },
      create: { customerId, employeeId },
      update: {},
    });
  },

  // Phase 19: assign is additive now — adds one employee's row alongside whoever
  // else is already assigned, a no-op if that pair already exists (duplicate
  // assignments are prevented by the unique(customerId, employeeId) constraint).
  // assignedManagerId is still a single scalar, set/overwritten as before. Takes a
  // tx client so the order-creation auto-assign path can run inside its own
  // transaction.
  async assign(
    customerId: number,
    employeeId: number,
    managerId: number | null,
    client: PrismaClientOrTx = prisma
  ) {
    await client.customerAssignedEmployee.upsert({
      where: { customerId_employeeId: { customerId, employeeId } },
      create: { customerId, employeeId },
      update: {},
    });
    return client.customer.update({
      where: { id: customerId },
      data: { assignedManagerId: managerId },
    });
  },

  async bulkAssign(customerIds: number[], employeeId: number, managerId: number | null) {
    await prisma.customerAssignedEmployee.createMany({
      data: customerIds.map((customerId) => ({ customerId, employeeId })),
      skipDuplicates: true,
    });
    return prisma.customer.updateMany({
      where: { id: { in: customerIds } },
      data: { assignedManagerId: managerId },
    });
  },

  // Removes one specific Employee's assignment, leaving every other assigned
  // Employee and assignedManagerId untouched — the customer stays within the
  // Manager's team scope (visible, shown among "Unassigned" for that one Employee)
  // rather than dropping into an Admin-only void. See the customer list mockup in
  // phases.md Phase 4 §1, which shows "Unassigned" as a normal row state, not a
  // hidden one. Takes a tx client so the automatic-removal recompute can run inside
  // its own transaction.
  unassign(customerId: number, employeeId: number, client: PrismaClientOrTx = prisma) {
    return client.customerAssignedEmployee.deleteMany({ where: { customerId, employeeId } });
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
