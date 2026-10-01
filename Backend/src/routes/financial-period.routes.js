import { Router } from 'express';
import {
  getFinancialPeriods,
  createFinancialPeriod,
} from '../controllers/financial-period.controller.js';

const router = Router();

router.get('/', getFinancialPeriods);
router.post('/', createFinancialPeriod);

export default router;
