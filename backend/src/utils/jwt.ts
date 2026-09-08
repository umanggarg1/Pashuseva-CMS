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
  // Production was direct cross-site for a while (frontend calling the backend's
  // real onrender.com URL from the browser) — that needed SameSite=None, fixed
  // after a real-browser cookie-jar test (Playwright, not curl — curl ignores
  // SameSite entirely) proved SameSite=Lax silently drops the cookie on every
  // cross-site fetch. Now fronted by a Vercel same-origin proxy instead (see
  // frontend/vercel.json's /api rewrite) specifically because SameSite=None,
  // even correctly configured, still isn't reliably honored by every browser —
  // some (including specific Chrome rollouts, as part of Google's own
  // third-party-cookie phase-out) reject or drop third-party-flavored cookies
  // regardless of the SameSite value, which is exactly what broke login for a
  // real user despite this setting being correct. None+Secure is left in place
  // regardless — harmless for same-origin requests too — as a safety margin in
  // case the proxy is ever bypassed again. SameSite=None requires Secure=true
  // (browsers reject None+non-Secure), which is why this is conditional rather
  // than a single hardcoded value: local dev serves both frontend and backend
  // from `localhost` (different ports, same site), where Lax already works fine
  // over plain http and None would be rejected outright since `secure` is false
  // there.
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
