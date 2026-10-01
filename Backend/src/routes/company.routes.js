import { Router } from 'express';
import {
  getCompanies,
  getCompanyBySymbol,
  createCompany,
} from '../controllers/company.controller.js';

const router = Router();

router.get('/', getCompanies);
router.get('/:symbol', getCompanyBySymbol);
router.post('/', createCompany);

export default router;
