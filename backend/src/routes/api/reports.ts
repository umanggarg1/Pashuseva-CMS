import { Router } from 'express';
import { dashboardController } from '../../controllers/dashboard.controller';
import { asyncHandler } from '../../utils/asyncHandler';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';

const router = Router();

router.use(authenticate);
// Phase 9 originally made Reports Admin/Manager-role-only. Phase 15 made Manager
// access configurable, so this is now the `report:view` permission like everything
// else — Admin always has it, a Manager needs it granted at approval time (or later)
// same as any other permission. Not in `DEFAULT_EMPLOYEE_PERMISSIONS`, so nothing
// changes for Employees unless a Manager/Admin deliberately grants it — preserving
// Phase 9's "Employees get the dashboard instead" intent as the default, not a hard
// rule baked into the gate itself.
router.use(authorize('report:view'));

router.get('/sales', asyncHandler(dashboardController.getSalesReport));
router.get('/orders', asyncHandler(dashboardController.getOrdersReport));
router.get('/customers', asyncHandler(dashboardController.getCustomersReport));
router.get('/products', asyncHandler(dashboardController.getProductsReport));
router.get('/payments', asyncHandler(dashboardController.getPaymentsReport));

export default router;
