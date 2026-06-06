import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { authenticate, AuthRequest } from '../middleware/auth';
import { uploadToS3 } from '../lib/s3';

const router = Router();
router.use(authenticate);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    const allowed = /pdf|doc|docx|mp4|webm|mov|jpg|jpeg|png|gif|webp/i;
    if (!allowed.test(path.extname(file.originalname))) {
      cb(new Error('File type not allowed. Accepted: PDF, DOC, DOCX, MP4, WebM, MOV, images'));
      return;
    }
    cb(null, true);
  },
});

// POST /upload/content — upload file to S3
router.post('/content', upload.single('file'), async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  try {
    const url = await uploadToS3(req.file.buffer, req.file.originalname, req.file.mimetype);
    res.json({
      url,
      originalName: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
    });
  } catch (err) {
    console.error('S3 upload error:', err);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

export default router;
