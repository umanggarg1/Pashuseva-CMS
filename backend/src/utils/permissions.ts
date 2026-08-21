import type { Permission } from '../schemas/permission.schema';
import type { Role } from '../generated/prisma/enums';

// The single source of truth for "does this acting user have this permission" —
// used by the authorize() middleware and by every service that needs to check the
// same rule inline (e.g. order creation's inline customer-creation check, or global
// search skipping a sub-search the caller can't otherwise reach). Only Admin
// bypasses unconditionally; Manager is checked against real grants exactly like
// Employee (Phase 15 — Manager access became configurable, replacing the old
// blanket Admin/Manager bypass).
export function hasPermission(
  actingUser: { role: Role | null; permissions?: string[] },
  permission: Permission
): boolean {
  if (actingUser.role === 'ADMIN') return true;
  return (actingUser.permissions ?? []).includes(permission);
}
