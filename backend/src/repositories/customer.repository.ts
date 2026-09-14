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

interface ExistingPhoneRow {
  id: number;
  phone: string;
  label: string | null;
  isPrimary: boolean;
}

interface ExistingAddressRow {
  id: number;
  line1: string;
  line2: string | null;
  city: string;
  district: string | null;
  state: string;
  pincode: string;
  landmark: string | null;
  country: string;
}

// update() used to delete-all-then-recreate every phone/address row on every
// save, even when nothing about them changed — the same "full replacement set,
// not a diff" convention order.repository.ts uses for OrderAddress/
// OrderAssignedEmployee. That's fine when the set is genuinely different, but on
// a no-op save (or one that only touched name/email) it burned new row ids and
// bumped CustomerAddress.updatedAt for no real edit. These reconcile against
// what's already stored instead: matched rows are updated in place (or left
// untouched if identical), only genuinely new/removed entries insert/delete.
//
// Take the existing rows as a parameter rather than re-querying for them —
// customerService.update() already fetched the customer (including phones/
// addresses) to compute the activity-log diff, and re-fetching the same rows
// here was two extra DB round trips per save for no reason. Measured live
// against the real (remote, Neon) dev DB: that redundancy alone was costing
// roughly half the total save time on a no-op save (see PHASE_ addendum notes
// for the numbers) — removed by threading the already-loaded rows through
// instead of asking the database for them twice.
async function syncPhones(
  tx: PrismaClientOrTx,
  customerId: number,
  phones: PhoneInput[],
  existing: ExistingPhoneRow[]
) {
  // Matched by phone number — the only value stable enough to key on, since the
  // client never sends row ids. Two rows sharing one number isn't prevented by
  // the schema but isn't a realistic case either.
  const existingByPhone = new Map(existing.map((p) => [p.phone, p]));
  const incomingNumbers = new Set(phones.map((p) => p.phone));

  for (const incoming of phones) {
    const match = existingByPhone.get(incoming.phone);
    const label = incoming.label ?? null;
    if (!match) {
      await tx.customerPhone.create({ data: { ...incoming, label, customerId } });
    } else if (match.label !== label || match.isPrimary !== incoming.isPrimary) {
      await tx.customerPhone.update({
        where: { id: match.id },
        data: { label, isPrimary: incoming.isPrimary },
      });
    }
  }

  const removedIds = existing.filter((p) => !incomingNumbers.has(p.phone)).map((p) => p.id);
  if (removedIds.length > 0) {
    await tx.customerPhone.deleteMany({ where: { id: { in: removedIds } } });
  }
}

// Same reconciliation for the (practically 1:1) address — update the existing row
// in place, only if it actually changed; create one only if none exists yet. Also
// cleans up any extra rows beyond the first, preserving the "at most one address
// per customer" invariant the old delete-all+create always incidentally kept.
// Takes the existing rows as a parameter — same reasoning as syncPhones above.
async function syncAddress(
  tx: PrismaClientOrTx,
  customerId: number,
  address: AddressInput,
  existingRows: ExistingAddressRow[]
) {
  const [existing, ...extras] = existingRows;
  const normalized = {
    line1: address.line1,
    line2: address.line2 ?? null,
    city: address.city,
    district: address.district ?? null,
    state: address.state,
    pincode: address.pincode,
    landmark: address.landmark ?? null,
    country: address.country ?? 'India',
  };

  if (!existing) {
    await tx.customerAddress.create({ data: { ...normalized, customerId } });
  } else {
    const changed =
      existing.line1 !== normalized.line1 ||
      existing.line2 !== normalized.line2 ||
      existing.city !== normalized.city ||
      existing.district !== normalized.district ||
      existing.state !== normalized.state ||
      existing.pincode !== normalized.pincode ||
      existing.landmark !== normalized.landmark ||
      existing.country !== normalized.country;
    if (changed) {
      await tx.customerAddress.update({ where: { id: existing.id }, data: normalized });
    }
  }

  if (extras.length > 0) {
    await tx.customerAddress.deleteMany({ where: { id: { in: extras.map((e) => e.id) } } });
  }
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

  // Phase 21: backs the Orders export dialog's Area picklist. Raw values, not
  // deduped/normalized here — real addresses have inconsistent casing/whitespace
  // ("Gurugram" / "gurugram " / "GURUGRAM"), so that cleanup happens in
  // customerService.getDistinctDistricts, once, in one place, rather than trying
  // to get Postgres's case-sensitive DISTINCT to do it.
  getAllDistricts() {
    return prisma.customerAddress.findMany({
      where: { district: { not: null } },
      select: { district: true },
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

  // existingPhones/existingAddresses: the caller (customerService.update) already
  // fetched the customer — including phones/addresses — to compute its own
  // activity-log diff, so it's passed straight through here instead of this
  // method re-querying for the same rows inside the transaction. Optional only
  // because a couple of other, narrower callers don't have them handy and don't
  // touch phones/address anyway (data.phones/data.address absent => unused).
  update(
    id: number,
    data: {
      name?: string;
      email?: string;
      notes?: string;
      phones?: PhoneInput[];
      address?: AddressInput;
    },
    existingPhones: ExistingPhoneRow[] = [],
    existingAddresses: ExistingAddressRow[] = []
  ) {
    return prisma.$transaction(async (tx) => {
      if (data.phones) {
        await syncPhones(tx, id, data.phones, existingPhones);
      }

      if (data.address) {
        await syncAddress(tx, id, data.address, existingAddresses);
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

  // metadata carries a { from, to } pair for edits that changed something concrete
  // (name/email/phones/address) so the Activity panel can show what actually
  // changed, not just that "something" did. Optional: activity entries that
  // aren't a value edit (assignment, trash, notes) pass nothing, same as before.
  recordActivity(
    customerId: number,
    activity: string,
    createdById: number,
    metadata?: Prisma.InputJsonValue,
    client: PrismaClientOrTx = prisma
  ) {
    return client.customerActivity.create({
      data: { customerId, activity, createdById, metadata },
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
