import { Router } from 'express';
import { categoryController } from '../../controllers/category.controller';
import { asyncHandler } from '../../utils/asyncHandler';
import { authenticate } from '../../middleware/authenticate';
import { authorize, requireRole } from '../../middleware/authorize';

const router = Router();

router.use(authenticate);

router.get('/', authorize('product:view'), asyncHandler(categoryController.list));
router.get('/:id', authorize('product:view'), asyncHandler(categoryController.getById));

router.post('/', requireRole('ADMIN', 'MANAGER'), asyncHandler(categoryController.create));
router.patch('/:id', requireRole('ADMIN', 'MANAGER'), asyncHandler(categoryController.update));
router.patch(
  '/:id/status',
  requireRole('ADMIN', 'MANAGER'),
  asyncHandler(categoryController.updateStatus)
);

export default router;
