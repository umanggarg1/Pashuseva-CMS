import { NextFunction, Request, Response } from 'express';
import { verifyAuthToken, AUTH_COOKIE_NAME } from '../utils/jwt';
import { userRepository } from '../repositories/user.repository';
import { permissionRepository } from '../repositories/permission.repository';
import { HttpError } from '../utils/httpError';

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[AUTH_COOKIE_NAME];
  if (!token) return next(new HttpError(401, 'Not authenticated'));

  let payload;
  try {
    payload = verifyAuthToken(token);
  } catch {
    return next(new HttpError(401, 'Not authenticated'));
  }

  // Phase 20 Step 3: run in parallel rather than sequentially — the permissions
  // lookup only ever needed payload.sub, which is already known before the user
  // lookup even starts, so there was never a real reason to wait for one before
  // starting the other. This is the single most-run code path in the app (every
  // authenticated request), so this shaves real time off all of them, not just
  // /auth/me.
  //
  // Deliberately not wrapped in try/catch: a thrown error here is a real DB/infra
  // failure (e.g. Neon waking from autosuspend), not an auth decision — letting it
  // reach errorHandler as a 500 keeps it distinguishable from a genuine invalid
  // session, instead of masking a transient hiccup as "not authenticated" and
  // logging a still-valid session out.
  const [user, permissions] = await Promise.all([
    userRepository.findById(payload.sub),
    permissionRepository.getForUser(payload.sub),
  ]);
  // PENDING is allowed through so a not-yet-approved account can hit /auth/me,
  // /auth/logout, and password-change — every actual business route stays
  // protected regardless, since authorize()/requireRole() both reject a role-less
  // user (Phase 15). Every other non-ACTIVE status is rejected here as before.
  if (!user || (user.status !== 'ACTIVE' && user.status !== 'PENDING')) {
    return next(new HttpError(401, 'Not authenticated'));
  }

  req.user = {
    id: user.id,
    role: user.role,
    permissions,
    customerDataScope: user.customerDataScope,
    orderDataScope: user.orderDataScope,
  };
  next();
}
