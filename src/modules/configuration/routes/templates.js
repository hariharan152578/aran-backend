import express from 'express';
import {
  getTemplates, getTemplateById, createTemplate, updateTemplate, deleteTemplate,
  getMeasurements, saveMeasurements,
  getFeatures, saveFeatures,
  getFormulas, saveFormulas,
  getBom, saveBom,
  getHardware, saveHardware,
  getPricing, savePricing,
  getVersions, saveVersionSnapshot,
  simulateTemplate,
  exportTemplateJson,
  createGoogleSheetTemplate,
  updateGoogleSheetTemplate
} from '../controllers/TemplateController.js';

const router = express.Router();

// Template Core
router.get('/', getTemplates);
router.post('/', createTemplate);
// Google Sheet template routes — MUST be above /:id or Express treats
// the literal string 'google-sheet' as a template id.
router.post('/google-sheet', createGoogleSheetTemplate);
router.put('/google-sheet/:id', updateGoogleSheetTemplate);
router.get('/:id', getTemplateById);
router.put('/:id', updateTemplate);
router.delete('/:id', deleteTemplate);

// Tabs
router.get('/:templateId/measurements', getMeasurements);
router.post('/:templateId/measurements', saveMeasurements);

router.get('/:templateId/features', getFeatures);
router.post('/:templateId/features', saveFeatures);

router.get('/:templateId/formulas', getFormulas);
router.post('/:templateId/formulas', saveFormulas);

router.get('/:templateId/bom', getBom);
router.post('/:templateId/bom', saveBom);

router.get('/:templateId/hardware', getHardware);
router.post('/:templateId/hardware', saveHardware);

router.get('/:templateId/pricing', getPricing);
router.post('/:templateId/pricing', savePricing);

router.get('/:templateId/versions', getVersions);
router.post('/:templateId/versions', saveVersionSnapshot);

// Engineering Simulator
router.post('/:templateId/simulate', simulateTemplate);

// Export
router.get('/:id/export', exportTemplateJson);

export default router;
