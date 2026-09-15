import express from 'express';
import explorerRoutes from './routes/explorer.js';
import templatesRoutes from './routes/templates.js';
import excelRoutes from './routes/excel.js';

const router = express.Router();

// Base status
router.get('/', (req, res) => {
  res.json({ message: 'Aran ERP: Configuration Module (Master Product Definition Engine) is active' });
});

// Modular Routes
router.use('/explorer', explorerRoutes);
router.use('/templates', templatesRoutes);
router.use('/import/excel', excelRoutes);

export default router;
