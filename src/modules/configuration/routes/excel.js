import express from 'express';
import multer from 'multer';
import fs from 'fs';
import { importExcel, getImportLogs, importExcelVersion, downloadOriginalExcel, approveReview, getReview, importJson, importReact } from '../controllers/ExcelController.js';

const router = express.Router();

const tempDir = './node_modules/.temp_uploads';
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir);
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
