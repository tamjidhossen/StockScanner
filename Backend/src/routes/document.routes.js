import { Router } from 'express';
import { uploadPdf } from '../middleware/upload.js';
import {
  uploadDocument,
  getDocuments,
  getDocumentById,
  getDocumentPageImage,
  deleteDocument,
} from '../controllers/document.controller.js';

const router = Router();

router.post('/upload', uploadPdf.single('file'), uploadDocument);
router.get('/', getDocuments);
router.get('/:id', getDocumentById);
router.get('/:id/pages/:pageNum/image', getDocumentPageImage);
router.delete('/:id', deleteDocument);

export default router;
