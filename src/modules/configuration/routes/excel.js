import express from 'express';
import multer from 'multer';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { importExcel, getImportLogs, importExcelVersion, downloadOriginalExcel, approveReview, getReview, importJson, importReact } from '../controllers/ExcelController.js';

const router = express.Router();

const primaryTempDir = path.resolve(process.cwd(), 'temp_uploads');
const fallbackTempDir = path.resolve(os.tmpdir(), 'aran-temp-uploads');

function getSafeUploadDir() {
  for (const dir of [primaryTempDir, fallbackTempDir, os.tmpdir()]) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o777 });
      }
      fs.accessSync(dir, fs.constants.W_OK);
      return dir;
    } catch (e) {
      // try next fallback
    }
  }
  return os.tmpdir();
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = getSafeUploadDir();
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage });

router.post('/', upload.single('excelFile'), importExcel);
router.post('/json', express.json({ limit: '10mb' }), importJson);
router.post('/react', upload.single('reactFile'), express.json({ limit: '10mb' }), importReact);
router.get('/review/:reviewId', getReview);
router.post('/:reviewId/approve', approveReview);
router.post('/:templateId/version', upload.single('excelFile'), importExcelVersion);
router.get('/logs', getImportLogs);
router.get('/download/:templateId', downloadOriginalExcel);

export default router;
