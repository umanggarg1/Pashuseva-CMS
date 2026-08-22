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
  // Frontend and backend are deployed on separate domains, so a cross-origin fetch
  // needs SameSite=None to have the cookie attached at all (Lax is dropped from
  // cross-site XHR/fetch, only sent on top-level navigations) — this always pairs
  // with Secure=true, since browsers reject SameSite=None without it. Dev stays Lax
  // (no HTTPS locally), matching secure's own dev/prod split below.
  const isProduction = config.nodeEnv === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? ('none' as const) : ('lax' as const),
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  };
}
