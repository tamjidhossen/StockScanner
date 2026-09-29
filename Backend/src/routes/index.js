import { Router } from 'express';
import stockRoutes from './stock.routes.js';
import healthRoutes from './health.routes.js';

const router = Router();

router.use('/stocks', stockRoutes);
router.use('/health', healthRoutes);

export default router;
