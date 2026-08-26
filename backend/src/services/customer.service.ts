import prisma from '../lib/prisma';
import { Prisma } from '../generated/prisma/client';
import { customerRepository } from '../repositories/customer.repository';
import { userRepository } from '../repositories/user.repository';
import { auditLogRepository } from '../repositories/auditLog.repository';
import { HttpError, NotFoundError } from '../utils/httpError';
import { customerDataWhere, hasCustomerDataAccess } from '../utils/dataScope';
import { hasPermission } from '../utils/permissions';
import { computeDeletionExpiry } from '../utils/trash';
import type { Role, DataScope } from '../generated/prisma/enums';
import type {
  CreateCustomerInput,
  UpdateCustomerInput,
  CustomerListQuery,
} from '../schemas/customer.schema';

type ActingUser = {
  id: number;
  role: Role | null;
  permissions?: string[];
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
    filters.push({ assignedEmployees: { some: { employeeId: query.assignedEmployeeId } } });
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
  // Phase 19: the order-creation-time customer search (PHASE19_TODO.md §A). With
  // order:customerSearchAll, searches every non-trashed customer regardless of
  // Data Scope; without it, falls back to the caller's normal customerDataWhere
  // scope (identical to what they already see on the Customers page). Either way
  // customerRepository.searchForOrder's fixed limited shape is all that's ever
  // returned — never the full profile, and never filtered by customer.status (an
  // Inactive customer must stay findable so a new order can reactivate them).
  searchForOrder(actingUser: ActingUser, search: string) {
    const scope = hasPermission(actingUser, 'order:customerSearchAll')
      ? {}
      : customerDataWhere(actingUser, actingUser.customerDataScope);
    // scope can itself contain a top-level OR (the Manager join-table fallback —
    // see utils/dataScope.ts) — combining it with search's own OR via AND, not
    // spread, so the two can never silently collide (same bug class already caught
    // twice in buildOrderWhere/buildCustomerWhere).
    return customerRepository.searchForOrder(
      {
        AND: [
          scope,
          {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { phones: { some: { phone: { contains: search } } } },
              { addresses: { some: { city: { contains: search, mode: 'insensitive' } } } },
              ...(Number.isInteger(Number(search)) ? [{ id: Number(search) }] : []),
            ],
          },
        ],
      },
      8
    );
  },

  list(actingUser: ActingUser, query: CustomerListQuery) {
    const where = buildCustomerWhere(actingUser, query);
    const skip = (query.page - 1) * query.pageSize;
    return customerRepository.findMany(where, {
      skip,
      take: query.pageSize,
      orderBy: { [query.sortBy]: query.sortDir },
    });
  },

  // An Employee never sees who's assigned to a customer (Manager/Admin only) — a
  // flat role rule, not a Data Scope/permission distinction like the rest of this
  // module, per explicit request. Stripped here rather than just hidden in the
  // frontend, so it's actually withheld, not just unrendered.
  async getById(id: number, actingUser: ActingUser) {
    const customer = await customerRepository.findById(id);
    if (!customer) throw new NotFoundError('Customer not found');
    if (actingUser.role === 'EMPLOYEE') {
      return { ...customer, assignedManager: undefined, assignedEmployees: undefined };
    }
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

  // Phase 19: manual status control is gone — Customer.status is fully derived from
  // order history now (see utils/customerAutomation.ts's recalculateCustomerState,
  // called from order.service.ts whenever an order's active/done state can change).
  // No service method left here to set it directly from a request body.

  // Same flat rule as getById above — an Employee never sees a customer's Activity
  // log, Manager/Admin only.
  getActivity(customerId: number, actingUser: ActingUser) {
    if (actingUser.role === 'EMPLOYEE') {
      throw new HttpError(403, 'You do not have access to this customer’s activity');
    }
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

  // Phase 19: removes one specific Employee's assignment — a customer can have
  // several now, so there's no longer a single slot to just clear.
  async unassign(customerId: number, employeeId: number, actingUser: ActingUser) {
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

    await customerRepository.unassign(customerId, employeeId);
    await customerRepository.recordActivity(customerId, 'Unassigned', actingUser.id);
    return customerRepository.findById(customerId);
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
