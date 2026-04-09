import express from 'express';
import multer from 'multer';
import { protect } from '../middleware/auth.js';
import { getResources, uploadResource } from '../controllers/resourceController.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

router.get('/', protect, getResources);
router.post('/upload', protect, upload.single('file'), uploadResource);

export default router;
