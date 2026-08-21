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
type ScopedUser = { id: number; role: Role | null; managerId?: number | null };

export function customerDataWhere(
  actingUser: ScopedUser,
  dataScope: DataScope | null | undefined
): Prisma.CustomerWhereInput {
  if (actingUser.role === 'ADMIN' || dataScope === 'ALL') return {};
  if (actingUser.role === 'MANAGER') return { assignedManagerId: actingUser.id };
  return { assignedEmployeeId: actingUser.id };
}

export function orderDataWhere(
  actingUser: ScopedUser,
  dataScope: DataScope | null | undefined
): Prisma.OrderWhereInput {
  if (actingUser.role === 'ADMIN' || dataScope === 'ALL') return {};
  if (actingUser.role === 'MANAGER') return { customer: { assignedManagerId: actingUser.id } };
  return { customer: { assignedEmployeeId: actingUser.id } };
}

export function hasCustomerDataAccess(
  actingUser: ScopedUser,
  dataScope: DataScope | null | undefined,
  customer: { assignedManagerId: number | null; assignedEmployeeId: number | null }
): boolean {
  if (actingUser.role === 'ADMIN' || dataScope === 'ALL') return true;
  if (actingUser.role === 'MANAGER') return customer.assignedManagerId === actingUser.id;
  return customer.assignedEmployeeId === actingUser.id;
}

export function hasOrderDataAccess(
  actingUser: ScopedUser,
  dataScope: DataScope | null | undefined,
  order: { customer: { assignedManagerId: number | null; assignedEmployeeId: number | null } }
): boolean {
  if (actingUser.role === 'ADMIN' || dataScope === 'ALL') return true;
  if (actingUser.role === 'MANAGER') return order.customer.assignedManagerId === actingUser.id;
  return order.customer.assignedEmployeeId === actingUser.id;
}
