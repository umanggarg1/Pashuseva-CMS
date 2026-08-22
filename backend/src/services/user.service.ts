import prisma from '../lib/prisma';
import { userRepository } from '../repositories/user.repository';
import { permissionRepository } from '../repositories/permission.repository';
import { auditLogRepository } from '../repositories/auditLog.repository';
import { authService } from './auth.service';
import { HttpError, NotFoundError } from '../utils/httpError';
import { computeDeletionExpiry } from '../utils/trash';
import { hasFullBusinessAccess } from '../utils/dataScope';
import {
  DEFAULT_EMPLOYEE_PERMISSIONS,
  DEFAULT_MANAGER_PERMISSIONS,
  type Permission,
} from '../schemas/permission.schema';
import type { Role, AccountStatus, DataScope } from '../generated/prisma/enums';

type ActingUser = {
  id: number;
  role: Role | null;
  permissions?: string[];
  customerDataScope?: DataScope | null;
  orderDataScope?: DataScope | null;
};

function sanitizeUser(user: {
  id: number;
  name: string | null;
  email: string;
  phone: string | null;
  role: Role | null;
  requestedRole: Role | null;
  status: AccountStatus;
  managerId: number | null;
  customerDataScope: DataScope | null;
  orderDataScope: DataScope | null;
  lastLoginAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    requestedRole: user.requestedRole,
    status: user.status,
    managerId: user.managerId,
    customerDataScope: user.customerDataScope,
    orderDataScope: user.orderDataScope,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

// Admin manages everyone; a Manager manages only their own directly-reporting Employees.
// A Manager can never manage another Manager or an Admin (managerId is only ever set to
// a Manager's own id for their own Employees, never for a peer Manager) — this is how
// Phase 15's "only Admin has authority over Managers" rule already holds structurally.
export async function assertManagesUser(actingUser: ActingUser, targetUserId: number) {
  const target = await userRepository.findById(targetUserId);
  if (!target) throw new NotFoundError('User not found');

  if (actingUser.role === 'ADMIN') return target;
  if (actingUser.role === 'MANAGER' && target.managerId === actingUser.id) return target;
  if (hasFullBusinessAccess(actingUser, actingUser.customerDataScope, actingUser.orderDataScope)) {
    return target;
  }

  throw new HttpError(403, 'You do not manage this user');
}

export const userService = {
  async list(actingUser: ActingUser, search?: string, status?: AccountStatus) {
    const fullAccess = hasFullBusinessAccess(
      actingUser,
      actingUser.customerDataScope,
      actingUser.orderDataScope
    );
    const where: { managerId?: number; search?: string; status?: AccountStatus } =
      actingUser.role === 'MANAGER' && !fullAccess ? { managerId: actingUser.id } : {};
    if (search) where.search = search;
    if (status) where.status = status;
    const users = await userRepository.list(where);
    return users.map(sanitizeUser);
  },

  // Global search (Ctrl+K): same Admin/Manager-only scoping as the Employees module
  // itself (routes/api/users.ts) — an Employee account must never even learn other
  // employees' names/emails exist via search, so this is skipped entirely for them,
  // not just filtered.
  async searchForGlobalSearch(actingUser: ActingUser, q: string, limit: number) {
    if (actingUser.role !== 'ADMIN' && actingUser.role !== 'MANAGER') return [];
    const fullAccess = hasFullBusinessAccess(
      actingUser,
      actingUser.customerDataScope,
      actingUser.orderDataScope
    );
    const where: { managerId?: number; search: string } =
      actingUser.role === 'MANAGER' && !fullAccess
        ? { managerId: actingUser.id, search: q }
        : { search: q };
    const users = await userRepository.list(where, limit);
    return users.map(sanitizeUser);
  },

  async create(
    input: {
      name: string;
      email: string;
      password: string;
      role: 'MANAGER' | 'EMPLOYEE';
      managerId?: number;
    },
    actingUser: ActingUser
  ) {
    if (input.role === 'MANAGER' && actingUser.role !== 'ADMIN') {
      throw new HttpError(403, 'Only an Admin can create Managers');
    }

    const existing = await userRepository.findByEmail(input.email);
    if (existing) throw new HttpError(409, 'A user with this email already exists');

    let managerId: number | undefined;
    if (input.role === 'EMPLOYEE') {
      if (actingUser.role === 'MANAGER') {
        managerId = actingUser.id;
      } else {
        // ADMIN creating an Employee must say which Manager they report to.
        if (!input.managerId) {
          throw new HttpError(400, 'managerId is required when an Admin creates an Employee');
        }
        const manager = await userRepository.findById(input.managerId);
        if (!manager || manager.role !== 'MANAGER') {
          throw new HttpError(400, 'managerId does not refer to an existing Manager');
        }
        managerId = manager.id;
      }
    }

    const passwordHash = await authService.hashPassword(input.password);
    const user = await userRepository.create({
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
      managerId,
    });

    // Phase 15: Manager access is configurable now, same as Employee — a freshly
    // created Manager needs real grants too, not the old unconditional role bypass.
    const defaultPermissions =
      input.role === 'MANAGER' ? DEFAULT_MANAGER_PERMISSIONS : DEFAULT_EMPLOYEE_PERMISSIONS;
    await permissionRepository.replaceForUser(user.id, defaultPermissions, actingUser.id);

    return sanitizeUser(user);
  },

  async update(id: number, data: { name?: string; email?: string }, actingUser: ActingUser) {
    await assertManagesUser(actingUser, id);
    const user = await userRepository.update(id, data);
    return sanitizeUser(user);
  },

  // The existing Deactivate/Activate toggle — deliberately left as its own concept,
  // separate from Suspend/Reactivate below (Phase 15 decision: keep INACTIVE and
  // SUSPENDED distinct rather than consolidating them).
  async updateStatus(id: number, status: 'ACTIVE' | 'INACTIVE', actingUser: ActingUser) {
    await assertManagesUser(actingUser, id);
    const user = await userRepository.updateStatus(id, status);
    return sanitizeUser(user);
  },

  async updateRole(id: number, role: Role, actingUser: ActingUser) {
    if (actingUser.role !== 'ADMIN') throw new HttpError(403, 'Only an Admin can change roles');
    const user = await userRepository.updateRole(id, role);
    return sanitizeUser(user);
  },

  // Admin-only review of a pending signup — the mockup's flow is exclusively
  // Admin-driven, never Manager, so this doesn't reuse assertManagesUser's
  // Manager-can-act-on-own-Employees allowance.
  async approve(
    id: number,
    input: {
      role: 'MANAGER' | 'EMPLOYEE';
      permissions: Permission[];
      customerDataScope?: DataScope;
      orderDataScope?: DataScope;
    },
    actingUser: ActingUser
  ) {
    if (actingUser.role !== 'ADMIN') throw new HttpError(403, 'Only an Admin can approve accounts');

    const target = await userRepository.findById(id);
    if (!target) throw new NotFoundError('User not found');
    if (target.status !== 'PENDING') {
      throw new HttpError(400, 'This account is not pending approval');
    }

    let user = await userRepository.approve(id, input.role, actingUser.id);
    await permissionRepository.replaceForUser(id, input.permissions, actingUser.id);
    if (input.customerDataScope || input.orderDataScope) {
      user = await userRepository.updateDataScope(id, {
        customerDataScope: input.customerDataScope,
        orderDataScope: input.orderDataScope,
      });
    }
    return sanitizeUser(user);
  },

  async reject(id: number, actingUser: ActingUser) {
    if (actingUser.role !== 'ADMIN') throw new HttpError(403, 'Only an Admin can reject accounts');

    const target = await userRepository.findById(id);
    if (!target) throw new NotFoundError('User not found');
    if (target.status !== 'PENDING') {
      throw new HttpError(400, 'This account is not pending approval');
    }

    const user = await userRepository.reject(id, actingUser.id);
    return sanitizeUser(user);
  },

  // Withdraws access from an already-active Manager or Employee. Reuses
  // assertManagesUser, so a Manager can suspend their own Employees but never
  // another Manager or an Admin — same structural rule as everywhere else in this
  // service, not a new restriction invented for this endpoint.
  async suspend(id: number, actingUser: ActingUser) {
    const target = await assertManagesUser(actingUser, id);
    if (target.status !== 'ACTIVE') {
      throw new HttpError(400, 'Only an active account can be suspended');
    }

    const user = await userRepository.suspend(id, actingUser.id);
    return sanitizeUser(user);
  },

  async reactivate(id: number, actingUser: ActingUser) {
    const target = await assertManagesUser(actingUser, id);
    if (target.status !== 'SUSPENDED') {
      throw new HttpError(400, 'Only a suspended account can be reactivated');
    }

    const user = await userRepository.reactivate(id);
    return sanitizeUser(user);
  },

  // Trash (Phase 3 addendum) — Admin-only, no permission grant involved, same shape
  // as approve/reject. An Admin account can never be deleted. If the target has
  // active dependents (an Employee's assigned customers/orders, or Employees still
  // reporting to a Manager), reassignment is required first, not just recommended —
  // reassignToUserId must be another account of the *same* role.
  //
  // Shared by delete() below and a dedicated preview endpoint, so the frontend can
  // show "Amit Kumar currently has: 25 assigned customers, 12 active orders" before
  // the Admin even attempts the delete, matching the spec's own mockup.
  async getDeleteImpact(id: number, actingUser: ActingUser) {
    if (actingUser.role !== 'ADMIN') {
      throw new HttpError(403, 'Only an Admin can delete an Employee or Manager');
    }
    const target = await userRepository.findById(id);
    if (!target) throw new NotFoundError('User not found');
    if (target.role === 'ADMIN') throw new HttpError(400, 'An Admin account cannot be deleted');
    if (!target.role) throw new HttpError(400, 'This account has not been approved yet');

    if (target.role === 'EMPLOYEE') {
      const [assignedCustomerCount, activeOrderCount] = await Promise.all([
        prisma.customer.count({ where: { assignedEmployeeId: id, deletedAt: null } }),
        prisma.order.count({
          where: {
            assignedEmployeeId: id,
            deletedAt: null,
            orderStatus: { notIn: ['CANCELLED', 'COMPLETED'] },
          },
        }),
      ]);
      return { role: target.role, assignedCustomerCount, activeOrderCount, reportingEmployeeCount: 0 };
    }

    if (target.role === 'MANAGER') {
      const reportingEmployeeCount = await prisma.user.count({
        where: { managerId: id, deletedAt: null },
      });
      return { role: target.role, assignedCustomerCount: 0, activeOrderCount: 0, reportingEmployeeCount };
    }

    return { role: target.role, assignedCustomerCount: 0, activeOrderCount: 0, reportingEmployeeCount: 0 };
  },

  async delete(id: number, actingUser: ActingUser, reassignToUserId?: number) {
    const target = await userRepository.findById(id);
    if (!target) throw new NotFoundError('User not found');

    const impact = await userService.getDeleteImpact(id, actingUser);

    if (impact.role === 'EMPLOYEE' && (impact.assignedCustomerCount > 0 || impact.activeOrderCount > 0)) {
      if (!reassignToUserId) {
        throw new HttpError(
          400,
          `This employee has ${impact.assignedCustomerCount} assigned customers and ${impact.activeOrderCount} active orders. Reassign them to another Employee before deleting.`
        );
      }
      const newEmployee = await userRepository.findById(reassignToUserId);
      if (!newEmployee || newEmployee.role !== 'EMPLOYEE') {
        throw new HttpError(400, 'reassignToUserId does not refer to an existing Employee');
      }
      await prisma.customer.updateMany({
        where: { assignedEmployeeId: id },
        data: { assignedEmployeeId: reassignToUserId },
      });
      await prisma.order.updateMany({
        where: { assignedEmployeeId: id },
        data: { assignedEmployeeId: reassignToUserId },
      });
    } else if (impact.role === 'MANAGER' && impact.reportingEmployeeCount > 0) {
      if (!reassignToUserId) {
        throw new HttpError(
          400,
          `This manager has ${impact.reportingEmployeeCount} employees reporting to them. Reassign those employees to another Manager before deleting.`
        );
      }
      const newManager = await userRepository.findById(reassignToUserId);
      if (!newManager || newManager.role !== 'MANAGER') {
        throw new HttpError(400, 'reassignToUserId does not refer to an existing Manager');
      }
      await prisma.user.updateMany({
        where: { managerId: id },
        data: { managerId: reassignToUserId },
      });
    }

    const expiresAt = computeDeletionExpiry();
    const user = await userRepository.softDelete(id, actingUser.id, expiresAt);
    await auditLogRepository.create({
      userId: actingUser.id,
      action: `Deleted ${target.role === 'MANAGER' ? 'Manager' : 'Employee'}`,
      meta: { userId: id, name: target.name, expiresAt: expiresAt.toISOString() },
    });
    return sanitizeUser(user);
  },

  async restore(id: number, actingUser: ActingUser) {
    if (actingUser.role !== 'ADMIN') throw new HttpError(403, 'Only an Admin can restore an account');

    const existing = await userRepository.findTrashedById(id);
    if (!existing) throw new NotFoundError('This account is not in Trash');

    const user = await userRepository.restore(id);
    await auditLogRepository.create({
      userId: actingUser.id,
      action: `Restored ${existing.role === 'MANAGER' ? 'Manager' : 'Employee'}`,
      meta: { userId: id, name: existing.name },
    });
    return sanitizeUser(user);
  },

  // actingUser is null when the daily purge (not an Admin) calls this.
  async permanentlyDelete(id: number, actingUser: ActingUser | null) {
    if (actingUser && actingUser.role !== 'ADMIN') {
      throw new HttpError(403, 'Only an Admin can permanently delete an account');
    }

    const existing = await userRepository.findTrashedById(id);
    if (!existing) throw new NotFoundError('This account is not in Trash');

    const user = await userRepository.permanentDelete(id);
    await auditLogRepository.create({
      userId: actingUser?.id,
      action: `Permanently Deleted ${existing.role === 'MANAGER' ? 'Manager' : 'Employee'}`,
      meta: {
        userId: id,
        name: existing.name,
        reason: actingUser ? 'Admin action' : '10-day trash period expired',
      },
    });
    return sanitizeUser(user);
  },
};
