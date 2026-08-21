import { Router } from 'express';
import { userController } from '../../controllers/user.controller';
import { asyncHandler } from '../../utils/asyncHandler';
import { authenticate } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';

const router = Router();

// Employee management is Admin/Manager-only — see the Permission Matrix in
// phases.md Phase 3 §24 ("View/Manage Employees").
router.use(authenticate, requireRole('ADMIN', 'MANAGER'));

router.get('/', asyncHandler(userController.list));
router.post('/', asyncHandler(userController.create));
router.patch('/:id', asyncHandler(userController.update));
router.patch('/:id/status', asyncHandler(userController.updateStatus));
router.patch('/:id/role', requireRole('ADMIN'), asyncHandler(userController.updateRole));

// Reviewing a pending signup is Admin-only, per the spec's own "Admin reviews"
// framing — never delegated to a Manager.
router.post('/:id/approve', requireRole('ADMIN'), asyncHandler(userController.approve));
router.post('/:id/reject', requireRole('ADMIN'), asyncHandler(userController.reject));

// Suspend/Reactivate: Admin or Manager may call these, but the service's
// assertManagesUser then restricts a Manager to only their own Employees — a
// Manager can never suspend another Manager or an Admin.
router.post('/:id/suspend', asyncHandler(userController.suspend));
router.post('/:id/reactivate', asyncHandler(userController.reactivate));

router.get('/:id/permissions', asyncHandler(userController.getPermissions));
router.put('/:id/permissions', asyncHandler(userController.updatePermissions));

// Move to Trash (Phase 3 addendum) — Admin-only, no permission grant involved, same
// as approve/reject. An Admin account can never be deleted (enforced in the service).
router.get(
  '/:id/delete-impact',
  requireRole('ADMIN'),
  asyncHandler(userController.getDeleteImpact)
);
router.delete('/:id', requireRole('ADMIN'), asyncHandler(userController.delete));

export default router;
