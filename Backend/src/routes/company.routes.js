import { Router } from 'express';
import {
  getCompanies,
  getCompanyBySymbol,
  createCompany,
  deleteCompany,
  purgeCompanyData,
} from '../controllers/company.controller.js';

const router = Router();

router.get('/', getCompanies);
router.get('/:symbol', getCompanyBySymbol);
router.post('/', createCompany);
router.delete('/:id', deleteCompany);
router.delete('/:id/data', purgeCompanyData);

export default router;
