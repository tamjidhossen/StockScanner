import { Router } from 'express';
import {
  triggerScreening,
  getLatestScreeningResult,
  getScreeningHistory,
} from '../controllers/screening.controller.js';

const router = Router();

router.post('/run/:companyId/:periodId', triggerScreening);
router.get('/results/:symbol', getLatestScreeningResult);
router.get('/results/:symbol/history', getScreeningHistory);

export default router;
