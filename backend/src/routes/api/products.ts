import { Router } from 'express';
import { productController } from '../../controllers/product.controller';
import { asyncHandler } from '../../utils/asyncHandler';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';

const router = Router();

router.use(authenticate);

router.get('/', authorize('product:view'), asyncHandler(productController.list));
// Must come before /:id — otherwise Express would try to parse "suggest-sku" as a
// numeric product id and fail validation instead of reaching this handler. Gated the
// same as product creation, since this is only ever used from the Add Product form.
router.get(
  '/suggest-sku',
  authorize('product:create'),
  asyncHandler(productController.suggestSku)
);
router.get('/:id', authorize('product:view'), asyncHandler(productController.getById));
router.get('/:id/activity', authorize('product:view'), asyncHandler(productController.getActivity));
router.get(
  '/:id/stock-history',
  authorize('product:view'),
  asyncHandler(productController.getStockHistory)
);

// Product create/update used to be Admin/Manager role-only (phases.md Phase 3 §24).
// Phase 15 made Manager access configurable, so this is now product:create/update
// like everything else — Admin always has it, Employees can be granted it too (not
// in DEFAULT_EMPLOYEE_PERMISSIONS, so nothing changes for Employees by default).
router.post('/', authorize('product:create'), asyncHandler(productController.create));
router.patch('/:id', authorize('product:update'), asyncHandler(productController.update));
// Deactivate/reactivate split out from product:update into its own permission
// (Phase 15 addendum) — matches the requested View/Create/Edit/Deactivate grid.
router.patch(
  '/:id/status',
  authorize('product:deactivate'),
  asyncHandler(productController.updateStatus)
);

// Move to Trash (Phase 3 addendum) — same product:deactivate permission as the
// status toggle above, both "remove from active use" at increasing severity.
router.delete('/:id', authorize('product:deactivate'), asyncHandler(productController.delete));

// Stock operations are permission-gated (not Admin/Manager-only like the rest of this
// file) so a Manager can grant "Add Stock" / "Adjust Stock" to a specific Employee
// without also handing them full product-edit rights (Phase 8 §12).
router.post('/:id/stock/add', authorize('stock:add'), asyncHandler(productController.addStock));
router.post(
  '/:id/stock/adjust',
  authorize('stock:adjust'),
  asyncHandler(productController.adjustStock)
);

export default router;
