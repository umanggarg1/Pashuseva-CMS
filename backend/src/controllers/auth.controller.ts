import { Request, Response } from 'express';
import { authService } from '../services/auth.service';
import {
  signupSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from '../schemas/auth.schema';
import { AUTH_COOKIE_NAME, authCookieOptions } from '../utils/jwt';
import { HttpError } from '../utils/httpError';

export const authController = {
  async signup(req: Request, res: Response) {
    const input = signupSchema.parse(req.body);
    await authService.signup(input);
    // Same response whether or not the email was already registered — see
    // authService.signup's comment. Mirrors forgotPassword's own wording.
    res.status(201).json({
      message:
        'If that email is not already registered, your account has been created and is waiting for approval from an administrator.',
    });
  },

  async login(req: Request, res: Response) {
    const { email, password } = loginSchema.parse(req.body);
    const { token, user, permissions } = await authService.login(email, password);

    res.cookie(AUTH_COOKIE_NAME, token, authCookieOptions());
    res.json({ user: { ...user, permissions } });
  },

  async logout(_req: Request, res: Response) {
    res.clearCookie(AUTH_COOKIE_NAME, { ...authCookieOptions(), maxAge: undefined });
    res.status(204).send();
  },

  async me(req: Request, res: Response) {
    if (!req.user) throw new HttpError(401, 'Not authenticated');
    const user = await authService.me(req.user.id);
    res.json(user);
  },

  async forgotPassword(req: Request, res: Response) {
    const { email } = forgotPasswordSchema.parse(req.body);
    await authService.forgotPassword(email);
    res.json({ message: 'If that email is registered, a reset link has been sent.' });
  },

  async resetPassword(req: Request, res: Response) {
    const { token, password } = resetPasswordSchema.parse(req.body);
    await authService.resetPassword(token, password);
    res.json({ message: 'Password reset successfully.' });
  },

  async changePassword(req: Request, res: Response) {
    if (!req.user) throw new HttpError(401, 'Not authenticated');
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    await authService.changePassword(req.user.id, currentPassword, newPassword);
    res.json({ message: 'Password changed successfully.' });
  },
};
