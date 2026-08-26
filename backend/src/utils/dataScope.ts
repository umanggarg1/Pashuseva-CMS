import { Prisma } from '../generated/prisma/client';
import type { Role, DataScope } from '../generated/prisma/enums';

// Phase 15 addendum: the single source of truth for "which customers/orders can
// this user see" — used for both list-query scoping (buildCustomerWhere/
// buildOrderWhere, dashboard.service.ts) and single-record access checks
// (checkCustomerAccess/checkOrderAccess middleware), so the two never drift apart.
// Admin is always "All", hardcoded here rather than stored on the User row. A null
// dataScope means "use the pre-addendum default" (Manager: their team, Employee:
// their own) — every account that predates this addendum keeps its exact current
// behavior. "All" means company-wide for anyone who has it, not just their own
// Manager's team — one universal meaning, regardless of role.
type ScopedUser = { id: number; role: Role | null };

// Phase 18 item 3: an Employee can now report to several Managers (EmployeeManager
// join table, replacing the old single User.managerId). When a customer/order is
// auto-created by an Employee with no manager explicitly chosen (assignedManagerId
// left null — see customer.service.ts's create()), it becomes visible to *every*
// Manager that Employee reports to, not just one. An explicit assignedManagerId
// (set by a Manager assigning themselves, or by resolveEmployeeAssignment resolving
// to exactly one manager) always wins and is authoritative once set — the
// join-table fallback only applies while it's still null.
type ManagedEmployee = { managedBy: { managerId: number }[] };

function managerSeesViaEmployee(managerId: number, assignedEmployee: ManagedEmployee | null | undefined): boolean {
  return assignedEmployee?.managedBy.some((m) => m.managerId === managerId) ?? false;
}

export function customerDataWhere(
  actingUser: ScopedUser,
  dataScope: DataScope | null | undefined
): Prisma.CustomerWhereInput {
  if (actingUser.role === 'ADMIN' || dataScope === 'ALL') return {};
  if (actingUser.role === 'MANAGER') {
    return {
      OR: [
        { assignedManagerId: actingUser.id },
        {
          assignedManagerId: null,
          assignedEmployee: { managedBy: { some: { managerId: actingUser.id } } },
        },
      ],
    };
  }
  return { assignedEmployeeId: actingUser.id };
}

export function orderDataWhere(
  actingUser: ScopedUser,
  dataScope: DataScope | null | undefined
): Prisma.OrderWhereInput {
  if (actingUser.role === 'ADMIN' || dataScope === 'ALL') return {};
  if (actingUser.role === 'MANAGER') {
    return {
      customer: {
        OR: [
          { assignedManagerId: actingUser.id },
          {
            assignedManagerId: null,
            assignedEmployee: { managedBy: { some: { managerId: actingUser.id } } },
          },
        ],
      },
    };
  }
  // Phase 18: an Employee sees an order if they're assigned to the customer (the
  // pre-existing rule) OR they're one of the order's own assigned employees (new —
  // several employees can now share/work an order without owning the customer).
  return {
    OR: [
      { customer: { assignedEmployeeId: actingUser.id } },
      { assignedEmployees: { some: { employeeId: actingUser.id } } },
    ],
  };
}

export function hasCustomerDataAccess(
  actingUser: ScopedUser,
  dataScope: DataScope | null | undefined,
  customer: {
    assignedManagerId: number | null;
    assignedEmployeeId: number | null;
    assignedEmployee?: ManagedEmployee | null;
  }
): boolean {
  if (actingUser.role === 'ADMIN' || dataScope === 'ALL') return true;
  if (actingUser.role === 'MANAGER') {
    if (customer.assignedManagerId === actingUser.id) return true;
    if (customer.assignedManagerId !== null) return false;
    return managerSeesViaEmployee(actingUser.id, customer.assignedEmployee);
  }
  return customer.assignedEmployeeId === actingUser.id;
}

export function hasOrderDataAccess(
  actingUser: ScopedUser,
  dataScope: DataScope | null | undefined,
  order: {
    customer: {
      assignedManagerId: number | null;
      assignedEmployeeId: number | null;
      assignedEmployee?: ManagedEmployee | null;
    };
    // Phase 18: optional so existing call sites that don't fetch it still type-check;
    // absent is treated the same as empty (no shared-assignment access).
    assignedEmployees?: { employeeId: number }[];
  }
): boolean {
  if (actingUser.role === 'ADMIN' || dataScope === 'ALL') return true;
  if (actingUser.role === 'MANAGER') {
    if (order.customer.assignedManagerId === actingUser.id) return true;
    if (order.customer.assignedManagerId !== null) return false;
    return managerSeesViaEmployee(actingUser.id, order.customer.assignedEmployee);
  }
  return (
    order.customer.assignedEmployeeId === actingUser.id ||
    (order.assignedEmployees?.some((a) => a.employeeId === actingUser.id) ?? false)
  );
}

// A Manager whose Customer AND Order data scope are both "All" (the "Full Access"
// permission preset) also gets full visibility into — and management authority
// over — every Employee/Manager in the company, not just their own direct reports.
// "All" already means company-wide rather than "my team" for Customers/Orders; this
// extends that same meaning to the Employees list, rather than inventing a separate
// employeeDataScope concept for what is really the same "Full Access" grant.
export function hasFullBusinessAccess(
  actingUser: { role: Role | null },
  customerDataScope: DataScope | null | undefined,
  orderDataScope: DataScope | null | undefined
): boolean {
  return actingUser.role === 'ADMIN' || (customerDataScope === 'ALL' && orderDataScope === 'ALL');
}
