import { Router } from 'express';
import { trashController } from '../../controllers/trash.controller';
import { asyncHandler } from '../../utils/asyncHandler';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';

const router = Router();

// Trash is Admin-only, no exceptions — "Manager: No Trash access unless you
// explicitly give it later. Employee: No Trash access." (spec's own wording).
router.use(authenticate, requireRole('ADMIN'));

router.get('/', asyncHandler(trashController.list));
router.post('/:type/:id/restore', asyncHandler(trashController.restore));
router.post('/:type/:id/permanent-delete', asyncHandler(trashController.permanentDelete));

export default router;
