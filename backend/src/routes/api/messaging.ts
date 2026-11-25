import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { messagingController } from '../../controllers/messaging.controller';

// Phase 32 C6: the Admin Messaging page. Every route needs message:manage
// (Admin-only by default — Admin bypasses authorize); every action is audited in
// the service layer.
const router = Router();

router.use(authenticate, authorize('message:manage'));

router.get('/status', asyncHandler(messagingController.status));
router.get('/messages', asyncHandler(messagingController.list));
router.post('/messages/:id/resolve', asyncHandler(messagingController.resolve));
router.post('/resume', asyncHandler(messagingController.resume));
router.post('/templates/refresh', asyncHandler(messagingController.refreshTemplates));

export default router;
