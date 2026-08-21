import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { userRepository } from '../repositories/user.repository';
import { permissionRepository } from '../repositories/permission.repository';
import { passwordResetRepository } from '../repositories/passwordReset.repository';
import { signAuthToken } from '../utils/jwt';
import { HttpError } from '../utils/httpError';
import { logger } from '../logger';
import type { SignupInput } from '../schemas/auth.schema';

const SALT_ROUNDS = 12;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function sanitizeUser(user: {
  id: number;
  name: string | null;
  email: string;
  phone: string | null;
  role: string | null;
  status: string;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
  };
}

export const authService = {
  async signup(input: SignupInput) {
    const existing = await userRepository.findByEmail(input.email);
    // Same rule as forgotPassword: never reveal whether an email is already
    // registered. A 409 "already exists" here would let anyone probe arbitrary
    // addresses against this CRM's user list. If it's taken, silently do nothing —
    // the controller returns the identical response either way.
    if (existing) return;

    const passwordHash = await this.hashPassword(input.password);
    await userRepository.signup({
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash,
      requestedRole: input.requestedRole,
    });
  },

  async login(email: string, password: string) {
    const user = await userRepository.findByEmail(email);
    if (!user) throw new HttpError(401, 'Invalid email or password');

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) throw new HttpError(401, 'Invalid email or password');

    // A trashed account (Phase 3 addendum) must never log in, regardless of
    // `status` — deletion is orthogonal to status by design (an ACTIVE employee can
    // be trashed without their status changing), so this needs its own explicit
    // check; `status` alone doesn't catch it. findByEmail deliberately doesn't
    // filter deletedAt (signup/login both need to see the email is still taken), so
    // the check has to happen here instead.
    if (user.deletedAt) {
      throw new HttpError(403, 'This account is not active. Contact an administrator.');
    }

    // A PENDING account can log in — it just sees a "waiting for approval" screen
    // instead of the app, per Phase 15. Every other non-ACTIVE status (SUSPENDED,
    // INACTIVE, REJECTED) is still fully blocked here, same as before.
    if (user.status !== 'ACTIVE' && user.status !== 'PENDING') {
      throw new HttpError(403, 'This account is not active. Contact an administrator.');
    }

    await userRepository.updateLastLogin(user.id);
    const permissions = await permissionRepository.getForUser(user.id);

    const token = signAuthToken({ sub: user.id, role: user.role });
    return { token, user: sanitizeUser(user), permissions };
  },

  async me(userId: number) {
    const user = await userRepository.findById(userId);
    if (!user) throw new HttpError(401, 'Not authenticated');
    const permissions = await permissionRepository.getForUser(user.id);
    return { ...sanitizeUser(user), permissions };
  },

  async forgotPassword(email: string) {
    const user = await userRepository.findByEmail(email);
    // Always behave the same way whether or not the account exists, to avoid leaking
    // which emails are registered.
    if (!user) return;

    const rawToken = crypto.randomBytes(32).toString('hex');
    await passwordResetRepository.create({
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    });

    // No email delivery yet — log the reset link for local development instead of
    // sending anything, and never return the raw token via the API response.
    logger.info(`Password reset requested for ${email}. Dev-only token: ${rawToken}`);
  },

  async resetPassword(rawToken: string, newPassword: string) {
    const tokenHash = hashToken(rawToken);
    const resetToken = await passwordResetRepository.findValidByTokenHash(tokenHash);
    if (!resetToken) throw new HttpError(400, 'Invalid or expired reset token');

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await userRepository.updatePasswordHash(resetToken.userId, passwordHash);
    await passwordResetRepository.markUsed(resetToken.id);
  },

  async changePassword(userId: number, currentPassword: string, newPassword: string) {
    const user = await userRepository.findById(userId);
    if (!user) throw new HttpError(401, 'Not authenticated');

    const validPassword = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!validPassword) throw new HttpError(400, 'Current password is incorrect');

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await userRepository.updatePasswordHash(userId, passwordHash);
  },

  hashPassword(password: string) {
    return bcrypt.hash(password, SALT_ROUNDS);
  },
};
