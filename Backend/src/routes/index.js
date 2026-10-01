import { Router } from 'express';
import companyRoutes from './company.routes.js';
import documentRoutes from './document.routes.js';
import financialPeriodRoutes from './financial-period.routes.js';
import screeningRoutes from './screening.routes.js';
import marketDataRoutes from './market-data.routes.js';
import factRoutes from './fact.routes.js';
import healthRoutes from './health.routes.js';

const router = Router();

router.use('/companies', companyRoutes);
router.use('/documents', documentRoutes);
router.use('/financial-periods', financialPeriodRoutes);
router.use('/screening', screeningRoutes);
router.use('/market-data', marketDataRoutes);
router.use('/facts', factRoutes);
router.use('/health', healthRoutes);

export default router;
