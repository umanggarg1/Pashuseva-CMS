import { NextFunction, Request, Response } from 'express';
import { verifyAuthToken, AUTH_COOKIE_NAME } from '../utils/jwt';
import { userRepository } from '../repositories/user.repository';
import { permissionRepository } from '../repositories/permission.repository';
import { HttpError } from '../utils/httpError';

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[AUTH_COOKIE_NAME];
    if (!token) throw new HttpError(401, 'Not authenticated');

    const payload = verifyAuthToken(token);
    const user = await userRepository.findById(payload.sub);
    // PENDING is allowed through so a not-yet-approved account can hit /auth/me,
    // /auth/logout, and password-change — every actual business route stays
    // protected regardless, since authorize()/requireRole() both reject a role-less
    // user (Phase 15). Every other non-ACTIVE status is rejected here as before.
    if (!user || (user.status !== 'ACTIVE' && user.status !== 'PENDING')) {
      throw new HttpError(401, 'Not authenticated');
    }

    const permissions = await permissionRepository.getForUser(user.id);
    req.user = {
      id: user.id,
      role: user.role,
      managerId: user.managerId,
      permissions,
      customerDataScope: user.customerDataScope,
      orderDataScope: user.orderDataScope,
    };
    next();
  } catch {
    next(new HttpError(401, 'Not authenticated'));
  }
}
