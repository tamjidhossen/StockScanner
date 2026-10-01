import multer from 'multer';

// Use memory storage so we can compute SHA-256 and validate magic bytes before writing to disk
const storage = multer.memoryStorage();

export const uploadPdf = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB max limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files (.pdf) are allowed for financial reports!'), false);
    }
  },
});
