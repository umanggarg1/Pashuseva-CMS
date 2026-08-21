import { Router } from 'express';
import { customerController } from '../../controllers/customer.controller';
import { asyncHandler } from '../../utils/asyncHandler';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { checkCustomerAccess } from '../../middleware/checkAccess';

const router = Router();

router.use(authenticate);

// GET /api/customers — scoped per role inside the service (Admin: all, Manager: team, Employee: own)
router.get('/', authorize('customer:view'), asyncHandler(customerController.list));

router.post('/', authorize('customer:create'), asyncHandler(customerController.create));

// Assignment used to be Admin/Manager role-only (§24: "Assign Customers"). Phase 15
// made Manager access configurable, so this now rides on customer:update — the same
// permission that gates editing a customer record, since (re)assignment is
// conceptually a customer-record update.
router.post(
  '/bulk-assign',
  authorize('customer:update'),
  asyncHandler(customerController.bulkAssign)
);

// GET /api/customers/:id
router.get(
  '/:id',
  authorize('customer:view'),
  checkCustomerAccess,
  asyncHandler(customerController.getById)
);

router.patch(
  '/:id',
  authorize('customer:update'),
  checkCustomerAccess,
  asyncHandler(customerController.update)
);

// Deactivating/reactivating a customer, matching "Delete Customers" in the Phase 3
// permission matrix — split out into its own customer:delete permission (Phase 15
// addendum), distinct from customer:update which stays on editing/(re)assignment.
router.patch(
  '/:id/status',
  authorize('customer:delete'),
  asyncHandler(customerController.updateStatus)
);

// Move to Trash (Phase 3 addendum) — deliberately the *same* customer:delete
// permission as the Deactivate toggle above: both are "remove from active use"
// actions of increasing severity, not two separately-grantable capabilities.
router.delete('/:id', authorize('customer:delete'), asyncHandler(customerController.delete));

router.get(
  '/:id/notes',
  authorize('customer:view'),
  checkCustomerAccess,
  asyncHandler(customerController.listNotes)
);
router.post(
  '/:id/notes',
  authorize('customer:view'),
  checkCustomerAccess,
  asyncHandler(customerController.addNote)
);

router.get(
  '/:id/activity',
  authorize('customer:view'),
  checkCustomerAccess,
  asyncHandler(customerController.getActivity)
);

router.post(
  '/:id/assign',
  authorize('customer:update'),
  asyncHandler(customerController.assign)
);
router.post(
  '/:id/reassign',
  authorize('customer:update'),
  asyncHandler(customerController.reassign)
);
router.post(
  '/:id/unassign',
  authorize('customer:update'),
  asyncHandler(customerController.unassign)
);

export default router;
