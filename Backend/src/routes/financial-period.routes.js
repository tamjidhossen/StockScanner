import { Router } from 'express';
import {
  getFinancialPeriods,
  createFinancialPeriod,
  deleteFinancialPeriod,
} from '../controllers/financial-period.controller.js';

const router = Router();

router.get('/', getFinancialPeriods);
router.post('/', createFinancialPeriod);
router.delete('/:id', deleteFinancialPeriod);

export default router;
