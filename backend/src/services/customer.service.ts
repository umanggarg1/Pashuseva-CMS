import prisma from '../lib/prisma';
import { Prisma } from '../generated/prisma/client';
import { customerRepository } from '../repositories/customer.repository';
import { userRepository } from '../repositories/user.repository';
import { auditLogRepository } from '../repositories/auditLog.repository';
import { HttpError, NotFoundError } from '../utils/httpError';
import { customerDataWhere, hasCustomerDataAccess } from '../utils/dataScope';
import { computeDeletionExpiry } from '../utils/trash';
import type { Role, CustomerStatus, DataScope } from '../generated/prisma/enums';
import type {
  CreateCustomerInput,
  UpdateCustomerInput,
  CustomerListQuery,
} from '../schemas/customer.schema';

type ActingUser = {
  id: number;
  role: Role | null;
  customerDataScope?: DataScope | null;
};

// Phase 18: a Manager may assign a customer to any Employee who reports to them —
// "reports to" now means EmployeeManager membership, not a single managerId
// equality, since an Employee can report to several Managers at once.
async function resolveEmployeeAssignment(employeeId: number, actingUser: ActingUser) {
  const employee = await userRepository.findById(employeeId);
  if (!employee || employee.role !== 'EMPLOYEE') {
    throw new HttpError(400, 'employeeId does not refer to an existing Employee');
  }

  const managerIds = (
    await prisma.employeeManager.findMany({
      where: { employeeId },
      select: { managerId: true },
    })
  ).map((m) => m.managerId);

  if (actingUser.role === 'MANAGER' && !managerIds.includes(actingUser.id)) {
    throw new HttpError(403, 'You can only assign customers to your own team');
  }

  // A Manager assigning to their own team is always the authoritative single
  // manager. Otherwise (Admin assigning), only collapse to a single manager when
  // the Employee has exactly one — with several, leave it null so every one of
  // their Managers gets visibility via the join-table fallback (see
  // utils/dataScope.ts) rather than picking one arbitrarily.
  const managerId =
    actingUser.role === 'MANAGER'
      ? actingUser.id
      : managerIds.length === 1
        ? managerIds[0]
        : null;
  return { employee, managerId };
}

// Admin sees everything; a Manager sees their team's customers; an Employee sees
// only what's assigned to them — see phases.md Phase 3 §20-21. A Manager/Employee
// cannot widen this via query params — only Admin may filter by arbitrary
// assignedEmployeeId/assignedManagerId.
function buildCustomerWhere(
  actingUser: ActingUser,
  query: CustomerListQuery
): Prisma.CustomerWhereInput {
  const scope = customerDataWhere(actingUser, actingUser.customerDataScope);

  const addressFilter: Prisma.CustomerWhereInput =
    query.city || query.district || query.state
      ? {
          addresses: {
            some: {
              ...(query.city && { city: { contains: query.city, mode: 'insensitive' as const } }),
              ...(query.district && {
                district: { contains: query.district, mode: 'insensitive' as const },
              }),
              ...(query.state && {
                state: { contains: query.state, mode: 'insensitive' as const },
              }),
            },
          },
        }
      : {};

  const createdAtFilter: Prisma.CustomerWhereInput =
    query.createdFrom || query.createdTo
      ? {
          createdAt: {
            ...(query.createdFrom && { gte: query.createdFrom }),
            ...(query.createdTo && { lte: query.createdTo }),
          },
        }
      : {};

  // Phase 18: scope (customerDataWhere) can now itself contain a top-level OR for a
  // Manager (explicit assignment OR the join-table fallback — see utils/dataScope.ts).
  // A second top-level OR for search, merged via spread, would silently *replace*
  // that key instead of combining with it — same bug class caught in
  // order.service.ts's buildOrderWhere. Everything goes into an AND array instead.
  const filters: Prisma.CustomerWhereInput[] = [scope];
  if (query.status) filters.push({ status: query.status });
  if (actingUser.role === 'ADMIN' && query.assignedEmployeeId) {
    filters.push({ assignedEmployeeId: query.assignedEmployeeId });
  }
  if (actingUser.role === 'ADMIN' && query.assignedManagerId) {
    filters.push({ assignedManagerId: query.assignedManagerId });
  }
  if (Object.keys(addressFilter).length > 0) filters.push(addressFilter);
  if (Object.keys(createdAtFilter).length > 0) filters.push(createdAtFilter);
  if (query.search) {
    filters.push({
      OR: [
        { name: { contains: query.search, mode: 'insensitive' as const } },
        { email: { contains: query.search, mode: 'insensitive' as const } },
        { phones: { some: { phone: { contains: query.search } } } },
        // Phase 11 §15 — customers are often found by location details before a name,
        // so the same free-text box also matches city/district/pincode, not just the
        // dedicated exact-filter fields above.
        {
          addresses: {
            some: { city: { contains: query.search, mode: 'insensitive' as const } },
          },
        },
        {
          addresses: {
            some: { district: { contains: query.search, mode: 'insensitive' as const } },
          },
        },
        { addresses: { some: { pincode: { contains: query.search } } } },
      ],
    });
  }

  return { AND: filters };
}

export const customerService = {
  list(actingUser: ActingUser, query: CustomerListQuery) {
    const where = buildCustomerWhere(actingUser, query);
    const skip = (query.page - 1) * query.pageSize;
    return customerRepository.findMany(where, {
      skip,
      take: query.pageSize,
      orderBy: { [query.sortBy]: query.sortDir },
    });
  },

  async getById(id: number) {
    const customer = await customerRepository.findById(id);
    if (!customer) throw new NotFoundError('Customer not found');
    return customer;
  },

  async create(input: CreateCustomerInput, actingUser: ActingUser) {
    // A Manager-created customer is scoped to that Manager immediately, and an
    // Employee-created customer to that Employee — otherwise the creator would be
    // locked out of their own customer (visibility requires assignedManagerId/
    // assignedEmployeeId === self) until someone else assigns it. assignedManagerId
    // is deliberately left unset for an Employee-created customer (Phase 18) — an
    // Employee can report to several Managers now, and every one of them gets
    // visibility via the join-table fallback in utils/dataScope.ts rather than this
    // picking just one.
    const customer = await customerRepository.create({
      name: input.name,
      email: input.email,
      notes: input.notes,
      createdById: actingUser.id,
      assignedManagerId: actingUser.role === 'MANAGER' ? actingUser.id : undefined,
      assignedEmployeeId: actingUser.role === 'EMPLOYEE' ? actingUser.id : undefined,
      phones: input.phones,
      address: input.address,
    });
    await customerRepository.recordActivity(customer.id, 'Customer created', actingUser.id);
    return customer;
  },

  async update(id: number, input: UpdateCustomerInput, actingUser: ActingUser) {
    const existing = await customerRepository.findById(id);
    if (!existing) throw new NotFoundError('Customer not found');

    const changes: string[] = [];
    if (input.name && input.name !== existing.name) changes.push('Name updated');
    if (input.email !== undefined && input.email !== existing.email) changes.push('Email updated');
    if (input.phones) changes.push('Phone numbers updated');
    if (input.address) changes.push('Address updated');

    const customer = await customerRepository.update(id, input);
    await Promise.all(
      changes.map((activity) => customerRepository.recordActivity(id, activity, actingUser.id))
    );
    return customer;
  },

  async updateStatus(id: number, status: CustomerStatus, actingUser: ActingUser) {
    const existing = await customerRepository.findById(id);
    if (!existing) throw new NotFoundError('Customer not found');

    const customer = await customerRepository.updateStatus(id, status);
    await customerRepository.recordActivity(
      id,
      status === 'ACTIVE' ? 'Customer reactivated' : 'Customer deactivated',
      actingUser.id
    );
    return customer;
  },

  getActivity(customerId: number) {
    return customerRepository.findActivity(customerId);
  },

  async assign(customerId: number, employeeId: number, actingUser: ActingUser) {
    const existing = await customerRepository.findAssignmentById(customerId);
    if (!existing) throw new NotFoundError('Customer not found');

    const { employee, managerId } = await resolveEmployeeAssignment(employeeId, actingUser);
    const customer = await customerRepository.assign(customerId, employeeId, managerId);
    await customerRepository.recordActivity(
      customerId,
      `Assigned to ${employee.name ?? employee.email}`,
      actingUser.id
    );
    return customer;
  },

  async reassign(customerId: number, employeeId: number, actingUser: ActingUser) {
    const existing = await customerRepository.findAssignmentById(customerId);
    if (!existing) throw new NotFoundError('Customer not found');

    const { employee, managerId } = await resolveEmployeeAssignment(employeeId, actingUser);
    const customer = await customerRepository.assign(customerId, employeeId, managerId);
    await customerRepository.recordActivity(
      customerId,
      `Reassigned to ${employee.name ?? employee.email}`,
      actingUser.id
    );
    return customer;
  },

  async unassign(customerId: number, actingUser: ActingUser) {
    const existing = await customerRepository.findAssignmentById(customerId);
    if (!existing) throw new NotFoundError('Customer not found');

    // Reuses the same access check as viewing — a Manager who can see this customer
    // (whether explicitly assigned or via the Phase 18 join-table fallback) can also
    // unassign it, rather than a narrower hand-rolled equality check that would miss
    // the fallback case.
    if (
      actingUser.role === 'MANAGER' &&
      !hasCustomerDataAccess(actingUser, actingUser.customerDataScope, existing)
    ) {
      throw new HttpError(403, 'You can only unassign customers within your own team');
    }

    const customer = await customerRepository.unassign(customerId);
    await customerRepository.recordActivity(customerId, 'Unassigned', actingUser.id);
    return customer;
  },

  async bulkAssign(customerIds: number[], employeeId: number, actingUser: ActingUser) {
    const { employee, managerId } = await resolveEmployeeAssignment(employeeId, actingUser);
    const result = await customerRepository.bulkAssign(customerIds, employeeId, managerId);
    await Promise.all(
      customerIds.map((id) =>
        customerRepository.recordActivity(
          id,
          `Assigned to ${employee.name ?? employee.email}`,
          actingUser.id
        )
      )
    );
    return result;
  },

  // Trash (Phase 3 addendum). Orders referencing this customer are deliberately
  // untouched — see phases.md's addendum for why.
  async delete(id: number, actingUser: ActingUser) {
    const existing = await customerRepository.findById(id);
    if (!existing) throw new NotFoundError('Customer not found');

    const expiresAt = computeDeletionExpiry();
    const customer = await customerRepository.softDelete(id, actingUser.id, expiresAt);
    await customerRepository.recordActivity(id, 'Moved to Trash', actingUser.id);
    await auditLogRepository.create({
      userId: actingUser.id,
      action: 'Deleted Customer',
      meta: { customerId: id, customerName: existing.name, expiresAt: expiresAt.toISOString() },
    });
    return customer;
  },

  async restore(id: number, actingUser: ActingUser) {
    const existing = await customerRepository.findTrashedById(id);
    if (!existing) throw new NotFoundError('This customer is not in Trash');

    const customer = await customerRepository.restore(id);
    await customerRepository.recordActivity(id, 'Restored from Trash', actingUser.id);
    await auditLogRepository.create({
      userId: actingUser.id,
      action: 'Restored Customer',
      meta: { customerId: id, customerName: existing.name },
    });
    return customer;
  },

  // actingUser is null when the daily purge (not an Admin) is the one calling this.
  async permanentlyDelete(id: number, actingUser: ActingUser | null) {
    const existing = await customerRepository.findTrashedById(id);
    if (!existing) throw new NotFoundError('This customer is not in Trash');

    const customer = await customerRepository.permanentDelete(id);
    await auditLogRepository.create({
      userId: actingUser?.id,
      action: 'Permanently Deleted Customer',
      meta: {
        customerId: id,
        customerName: existing.name,
        reason: actingUser ? 'Admin action' : '10-day trash period expired',
      },
    });
    return customer;
  },
};
