import { Router } from 'express';
import customersRouter from './customers';
import authRouter from './auth';
import usersRouter from './users';
import productsRouter from './products';
import categoriesRouter from './categories';
import ordersRouter from './orders';
import searchRouter from './search';
import dashboardRouter from './dashboard';
import reportsRouter from './reports';
import trashRouter from './trash';

const router = Router();

router.get('/', (_req, res) => res.json({ ok: true, version: 'v1' }));

router.use('/auth', authRouter);
router.use('/users', usersRouter);
router.use('/customers', customersRouter);
router.use('/products', productsRouter);
router.use('/categories', categoriesRouter);
router.use('/orders', ordersRouter);
router.use('/search', searchRouter);
router.use('/dashboard', dashboardRouter);
router.use('/reports', reportsRouter);
router.use('/trash', trashRouter);

export default router;
