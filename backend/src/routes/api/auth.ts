import { Router } from 'express';
import { authController } from '../../controllers/auth.controller';
import { asyncHandler } from '../../utils/asyncHandler';
import { authenticate } from '../../middleware/authenticate';
import {
  loginRateLimiter,
  signupRateLimiter,
  passwordResetRateLimiter,
} from '../../middleware/rateLimiter';

const router = Router();

router.post('/signup', signupRateLimiter, asyncHandler(authController.signup));
router.post('/login', loginRateLimiter, asyncHandler(authController.login));
router.post('/logout', asyncHandler(authController.logout));
router.get('/me', authenticate, asyncHandler(authController.me));
router.post(
  '/forgot-password',
  passwordResetRateLimiter,
  asyncHandler(authController.forgotPassword)
);
router.post(
  '/reset-password',
  passwordResetRateLimiter,
  asyncHandler(authController.resetPassword)
);
router.post('/change-password', authenticate, asyncHandler(authController.changePassword));

export default router;
