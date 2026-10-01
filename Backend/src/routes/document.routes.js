import { Router } from 'express';
import { uploadPdf } from '../middleware/upload.js';
import {
  uploadDocument,
  getDocuments,
  getDocumentById,
  getDocumentPageImage,
} from '../controllers/document.controller.js';

const router = Router();

router.post('/upload', uploadPdf.single('file'), uploadDocument);
router.get('/', getDocuments);
router.get('/:id', getDocumentById);
router.get('/:id/pages/:pageNum/image', getDocumentPageImage);

export default router;
