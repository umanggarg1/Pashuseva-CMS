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

// Phase 19 §A: the order-creation-time customer search — order:create-gated (not
// customer:view/Data Scope), with its own separate order:customerSearchAll
// permission deciding company-wide vs the caller's normal scope. Always returns the
// limited shape (name/phone/city/assigned employees), never the full profile — see
// customerService.searchForOrder's comment.
router.get(
  '/search-for-order',
  authorize('order:create'),
  asyncHandler(customerController.searchForOrder)
);

router.post('/', authorize('customer:create'), asyncHandler(customerController.create));

// Assignment used to be Admin/Manager role-only (§24: "Assign Customers"). Phase 15
// made Manager access configurable, riding on customer:update at the time — Phase 19
// splits it into its own customer:assign permission instead (not granted to an
// Employee by default, unlike customer:update), so manual (re)assignment is an
// explicit grant, not something every Employee with edit access can already do.
router.post(
  '/bulk-assign',
  authorize('customer:assign'),
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

// Phase 19: the old manual Deactivate/Reactivate toggle (PATCH /:id/status) is
// gone — Customer.status is fully derived from order history now, never settable
// directly. See customerService's comment.

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
  authorize('customer:assign'),
  asyncHandler(customerController.assign)
);
router.post(
  '/:id/reassign',
  authorize('customer:assign'),
  asyncHandler(customerController.reassign)
);
router.post(
  '/:id/unassign',
  authorize('customer:assign'),
  asyncHandler(customerController.unassign)
);

export default router;
