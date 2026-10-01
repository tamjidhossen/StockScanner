import { Router } from 'express';
import { getFactsByPeriod, getRawFactsByDocument } from '../controllers/fact.controller.js';

const router = Router();

router.get('/period/:periodId', getFactsByPeriod);
router.get('/document/:documentId', getRawFactsByDocument);

export default router;
