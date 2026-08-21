import { Router } from 'express';
import { orderController } from '../../controllers/order.controller';
import { asyncHandler } from '../../utils/asyncHandler';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { checkOrderAccess } from '../../middleware/checkAccess';

const router = Router();

router.use(authenticate);

// GET /api/orders — scoped per role inside the service (Admin: all, Manager: team, Employee: own)
router.get('/', authorize('order:view'), asyncHandler(orderController.list));

// Access to the target customer is checked inside the service (there's no :id route
// param to run checkCustomerAccess against at creation time) — see phases.md §3.
router.post('/', authorize('order:create'), asyncHandler(orderController.create));

// Must be registered before GET /:id — otherwise Express's numeric :id param would
// greedily match "number" as the id value and never reach this handler. Access is
// checked inside orderService.getByOrderNumber (no :id param here for checkOrderAccess
// to run against) — see ORDER_DETAILS_UPGRADE_TODO.md §1.
router.get(
  '/number/:orderNumber',
  authorize('order:view'),
  asyncHandler(orderController.getByOrderNumber)
);

router.get(
  '/:id',
  authorize('order:view'),
  checkOrderAccess,
  asyncHandler(orderController.getById)
);

router.patch(
  '/:id',
  authorize('order:update'),
  checkOrderAccess,
  asyncHandler(orderController.update)
);

router.patch(
  '/:id/status',
  authorize('order:update'),
  checkOrderAccess,
  asyncHandler(orderController.updateStatus)
);

router.post(
  '/:id/cancel',
  authorize('order:cancel'),
  checkOrderAccess,
  asyncHandler(orderController.cancel)
);

// Reordering creates a brand-new order, so it needs order:create — but checkOrderAccess
// still gates it on the *source* order, since that's what :id refers to here.
router.post(
  '/:id/reorder',
  authorize('order:create'),
  checkOrderAccess,
  asyncHandler(orderController.reorder)
);

router.get(
  '/:id/payments',
  authorize('payment:view'),
  checkOrderAccess,
  asyncHandler(orderController.getPayments)
);
router.post(
  '/:id/payments',
  authorize('payment:create'),
  checkOrderAccess,
  asyncHandler(orderController.addPayment)
);
router.post(
  '/:id/payments/:paymentId/reverse',
  authorize('payment:edit'),
  checkOrderAccess,
  asyncHandler(orderController.reversePayment)
);

// Phase 7 will eventually move this into a dedicated delivery API (phases.md §29).
router.patch(
  '/:id/delivery-status',
  authorize('delivery:update'),
  checkOrderAccess,
  asyncHandler(orderController.updateDeliveryStatus)
);

router.get(
  '/:id/tracking',
  authorize('order:view'),
  checkOrderAccess,
  asyncHandler(orderController.getTracking)
);

router.get(
  '/:id/notes',
  authorize('order:view'),
  checkOrderAccess,
  asyncHandler(orderController.listNotes)
);
router.post(
  '/:id/notes',
  authorize('order:view'),
  checkOrderAccess,
  asyncHandler(orderController.addNote)
);

router.get(
  '/:id/activity',
  authorize('order:view'),
  checkOrderAccess,
  asyncHandler(orderController.getActivity)
);

// Parcel Summary / shipping label — regenerated fresh from the Order/Customer/Product
// records on every request (no stored file), so it always reflects current data.
router.get(
  '/:id/parcel-summary',
  authorize('order:view'),
  checkOrderAccess,
  asyncHandler(orderController.getParcelSummaryPdf)
);

// Move to Trash (Phase 3 addendum).
router.delete(
  '/:id',
  authorize('order:delete'),
  checkOrderAccess,
  asyncHandler(orderController.delete)
);

export default router;
