import { permissionRepository } from '../repositories/permission.repository';
import { userRepository } from '../repositories/user.repository';
import { assertManagesUser } from './user.service';
import { hasPermission } from '../utils/permissions';
import { HttpError } from '../utils/httpError';
import type { Permission } from '../schemas/permission.schema';
import type { Role, DataScope } from '../generated/prisma/enums';

type ActingUser = { id: number; role: Role | null; permissions?: string[] };

// Phase 15 addendum: editing an Employee's permissions is Admin-only by default —
// a Manager needs the explicit employee:manage-permissions grant to do it for their
// own Employees. Viewing stays open to any Manager for their own Employees (the
// existing assertManagesUser rule, unchanged) — only the write path is gated.
function assertCanEditPermissions(actingUser: ActingUser) {
  if (actingUser.role === 'ADMIN') return;
  if (actingUser.role === 'MANAGER' && hasPermission(actingUser, 'employee:manage-permissions')) {
    return;
  }
  throw new HttpError(
    403,
    'You do not have permission to edit permissions. Ask an Admin to grant it.'
  );
}

export const permissionService = {
  async getForUser(userId: number, actingUser: ActingUser) {
    await assertManagesUser(actingUser, userId);
    return permissionRepository.getForUser(userId);
  },

  async replaceForUser(
    userId: number,
    input: {
      permissions: Permission[];
      customerDataScope?: DataScope;
      orderDataScope?: DataScope;
    },
    actingUser: ActingUser
  ) {
    await assertManagesUser(actingUser, userId);
    assertCanEditPermissions(actingUser);

    await permissionRepository.replaceForUser(userId, input.permissions, actingUser.id);
    if (input.customerDataScope || input.orderDataScope) {
      await userRepository.updateDataScope(userId, {
        customerDataScope: input.customerDataScope,
        orderDataScope: input.orderDataScope,
      });
    }
    return input.permissions;
  },
};
