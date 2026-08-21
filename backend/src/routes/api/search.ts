import { Router } from 'express';
import { searchController } from '../../controllers/search.controller';
import { asyncHandler } from '../../utils/asyncHandler';
import { authenticate } from '../../middleware/authenticate';

const router = Router();

router.use(authenticate);

// No authorize() here on purpose — each sub-search (customers/products/orders) is
// already permission-scoped inside its own service's list(), so there's nothing
// additional to gate at this route level.
router.get('/', asyncHandler(searchController.global));

export default router;
