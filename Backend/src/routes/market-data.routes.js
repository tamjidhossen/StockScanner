import { Router } from 'express';
import {
  syncCompanyMarketData,
  getLiveQuote,
  getCompanyMarketDataHistory,
} from '../controllers/market-data.controller.js';

const router = Router();

router.post('/sync/:symbol', syncCompanyMarketData);
router.get('/quote/:symbol', getLiveQuote);
router.get('/:symbol', getCompanyMarketDataHistory);

export default router;
