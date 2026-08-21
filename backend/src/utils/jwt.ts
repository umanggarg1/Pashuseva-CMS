import jwt from 'jsonwebtoken';
import config from '../config';
import type { Role } from '../generated/prisma/enums';

export const AUTH_COOKIE_NAME = 'crm_session';
const EXPIRES_IN = '7d';

export interface AuthTokenPayload {
  sub: number;
  role: Role | null;
}

export function signAuthToken(payload: AuthTokenPayload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: EXPIRES_IN });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  return jwt.verify(token, config.jwtSecret) as unknown as AuthTokenPayload;
}

export function authCookieOptions() {
  return {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax' as const,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  };
}
