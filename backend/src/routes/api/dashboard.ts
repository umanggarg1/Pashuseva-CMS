import { Router } from 'express';
import { dashboardController } from '../../controllers/dashboard.controller';
import { asyncHandler } from '../../utils/asyncHandler';
import { authenticate } from '../../middleware/authenticate';

const router = Router();

router.use(authenticate);

// Every role gets a summary — it's automatically scoped to what they can see
// (Admin/Manager get the full business view, Employee gets only their own assigned
// customers/orders), which is what backs the Employee's smaller "My Dashboard" (Phase 9 §17-18).
router.get('/summary', asyncHandler(dashboardController.getSummary));

export default router;
