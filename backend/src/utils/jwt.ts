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
  // Production is genuinely cross-site: the frontend (vercel.app) calls this
  // backend's real URL (onrender.com) directly via VITE_API_BASE_URL, not through
  // a same-origin proxy — confirmed by inspecting the deployed bundle and, more
  // conclusively, by a real-browser cookie-jar test (Playwright, not curl — curl
  // ignores SameSite entirely and had been masking this). With SameSite=Lax, the
  // browser silently drops the cookie on every cross-site fetch, so a session set
  // on login was never actually sent back on any subsequent request. SameSite=None
  // requires Secure=true (browsers reject the combination None+non-Secure), which
  // is why this is conditional rather than a single hardcoded value: local dev
  // serves both frontend and backend from `localhost` (different ports, same
  // site), where Lax already works fine over plain http and None would be
  // rejected outright since `secure` is false there.
  const isProd = config.nodeEnv === 'production';
  const sameSite: 'none' | 'lax' = isProd ? 'none' : 'lax';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  };
}
