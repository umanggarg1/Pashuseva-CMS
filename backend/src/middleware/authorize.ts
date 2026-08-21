import { NextFunction, Request, Response } from 'express';
import { HttpError } from '../utils/httpError';
import { hasPermission } from '../utils/permissions';
import type { Permission } from '../schemas/permission.schema';
import type { Role } from '../generated/prisma/enums';

// Permission-gated: only Admin bypasses unconditionally. Manager used to bypass
// this entirely too (Phase 3), but as of Phase 15 Manager access is configurable —
// a Manager is checked against real permission grants exactly like an Employee. A
// pending/rejected/suspended account (role === null) never has any grants, so it
// falls straight through to the 403 below.
export function authorize(...permissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, 'Not authenticated'));

    const hasAll = permissions.every((permission) => hasPermission(req.user!, permission));
    if (!hasAll) return next(new HttpError(403, 'Forbidden'));

    next();
  };
}

// Role-gated: for endpoints (user/employee management, permission grants, customer
// assignment) that aren't part of the Employee `resource:action` permission list at all.
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, 'Not authenticated'));
    if (!req.user.role || !roles.includes(req.user.role)) {
      return next(new HttpError(403, 'Forbidden'));
    }
    next();
  };
}
