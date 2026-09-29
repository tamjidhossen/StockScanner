import { Router } from 'express';
import { getStocks, getStockBySymbol } from '../controllers/stock.controller.js';

const router = Router();

router.get('/', getStocks);
router.get('/:symbol', getStockBySymbol);

export default router;
