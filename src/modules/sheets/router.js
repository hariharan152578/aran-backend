/**
 * Google Sheets calculation endpoints, mounted at /api/sheets by the module
 * loader in src/index.js.
 *
 * Note that the loader swallows import failures with a console.warn, so a
 * syntax error in this file (or anything it imports) shows up as a 404 on every
 * route here rather than a crash. If /api/sheets/verify 404s, check the server
 * log for "[WARN] Skipping module sheets".
 */

import express from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { AppsScriptError, fetchStructure } from './appsScriptClient.js';
import { summariseStructure, refreshStructure, getStructure } from './structureService.js';
import { runSheetEngine, recordSheetError } from './sheetEngine.js';
import { lockStats } from './sheetLock.js';
import { parseExcelWorkbook, summarizeExcelTabs } from './excelStructureService.js';
import { runExcelEngine, TEMPLATE_STORAGE_DIR, getTemplateFilePath, persistTemplateWorkbook, getTemplateBuffer } from './excelEngine.js';
import Template from '../configuration/models/Template.js';
import TemplatePricing from '../configuration/models/TemplatePricing.js';
import TemplateSheetStructure from '../configuration/models/TemplateSheetStructure.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }
});

/**
 * Every failure in this module answers with the same envelope so the frontend
 * has one error path to render:
 *   { ok: false, error: { kind, message, status, snippet } }
 */
export function sendError(res, err) {
  if (err instanceof AppsScriptError) {
    return res.status(err.httpStatus).json({ ok: false, error: err.toJSON() });
  }
  const status = err.status || 500;
  return res.status(status).json({
    ok: false,
    error: { kind: err.kind || 'SERVER', message: err.message || 'Unexpected error', status, snippet: null }
  });
}

export function normalizeHints(h) {
  if (!h || typeof h !== 'object') return null;
  return {
    wNoCol: h.wNoCol ?? h.w_no_col ?? null,
    widthCol: h.widthCol ?? h.width_col ?? null,
    heightCol: h.heightCol ?? h.height_col ?? null,
    headerRow: h.headerRow ?? h.header_row ?? null,
    dataStartRow: h.dataStartRow ?? h.data_start_row ?? null,
    dataEndRow: h.dataEndRow ?? h.data_end_row ?? null
  };
}

router.get('/', (req, res) => {
  res.json({ message: 'Aran ERP: Google Sheets calculation module is active', locks: lockStats() });
});

/**
 * POST /api/sheets/verify   { url }
 *
 * Backs the "Verify connection" button. Stateless - no template exists yet, so
 * this takes a bare URL and returns the tab list to populate the picker.
 *
 * Returns the summary only (no `cells`): the full blueprint is fetched
 * server-side at save time, which also keeps it clear of express.json()'s
 * default 100kb request limit.
 */
router.post('/verify', async (req, res) => {
  try {
    const { url } = req.body || {};
    const { sheets, durationMs } = await fetchStructure(url);
    const { tabs, suggested } = summariseStructure(sheets);

    if (tabs.length === 0) {
      return res.status(502).json({
        ok: false,
        error: { kind: 'SCRIPT_ERROR', message: 'The web app responded but reported no tabs in this workbook.', status: 200, snippet: null }
      });
    }

    res.json({
      ok: true,
      durationMs,
      tabs,
      suggested,
      sheets,
      // Surfaced so the modal can warn when a workbook has no writable tab at
      // all, which usually means the headers are named something unexpected.
      calculableCount: tabs.filter(t => t.calculable).length
    });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * POST /api/sheets/excel/inspect
 *
 * Inspects a directly uploaded .xlsx file.
 * Returns tab summary, input column hints, and full sheet blueprints for instant preview.
 */
router.post('/excel/inspect', upload.single('excelFile'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ ok: false, error: { message: 'No Excel (.xlsx) file was uploaded.' } });
    }

    const startTime = Date.now();
    const parsed = parseExcelWorkbook(req.file.buffer);
    const summary = summarizeExcelTabs(parsed.sheets);
    const durationMs = Date.now() - startTime;

    res.json({
      ok: true,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      durationMs,
      tabs: summary.tabs,
      suggested: summary.suggested,
      sheets: parsed.sheets,
      calculableCount: summary.tabs.filter(t => t.calculable).length
    });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * POST /api/sheets/excel/create-template
 *
 * Creates a template backed directly by an uploaded .xlsx file.
 * Completely bypasses Google Sheets and Apps Script.
 */
router.post('/excel/create-template', upload.single('excelFile'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ ok: false, error: { message: 'No Excel file uploaded.' } });
    }

    const {
      name, productName, description = '',
      categoryId, subcategoryId, folderId,
      sheetName, materialSheetName = '',
      inputHints: rawHints,
      defaultPrintPages: rawPages,
      customCellStyles: rawStyles
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ ok: false, error: { message: 'Template name is required.' } });
    }
    if (!categoryId) {
      return res.status(400).json({ ok: false, error: { message: 'Category is required.' } });
    }
    if (!sheetName) {
      return res.status(400).json({ ok: false, error: { message: 'Calculation sheet tab is required.' } });
    }

    const inputHints = typeof rawHints === 'string' ? JSON.parse(rawHints) : (rawHints || null);
    const defaultPrintPages = typeof rawPages === 'string' ? JSON.parse(rawPages) : (rawPages || []);
    const customCellStyles = typeof rawStyles === 'string' ? JSON.parse(rawStyles) : (rawStyles || {});

    // Generate unique code EX-{NAME}-{TAB}
    const sanitize = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const baseCode = `EX-${sanitize(name)}-${sanitize(sheetName)}`.slice(0, 40);
    let code = baseCode;
    let suffix = 2;
    while (await Template.findOne({ code })) {
      code = `${baseCode}-${suffix++}`;
    }

    // Parse sheets blueprint from uploaded buffer
    const parsed = parseExcelWorkbook(req.file.buffer);
    const blueprint = parsed.sheets[sheetName] || null;
    const materialBlueprint = materialSheetName ? (parsed.sheets[materialSheetName] || null) : null;

    if (!blueprint) {
      return res.status(422).json({
        ok: false,
        error: { message: `Selected calculation tab "${sheetName}" does not exist in workbook.` }
      });
    }

    const normalizedHints = normalizeHints(inputHints) || normalizeHints(blueprint.input_field_hints);

    // Prepare template document
    const template = new Template({
      name: name.trim(),
      productName: (productName || name).trim(),
      code,
      description,
      categoryId,
      subcategoryId: subcategoryId || null,
      folderId: folderId || null,
      templateType: 'EXCEL',
      status: 'VALIDATED',
      excelWorkbook: {
        originalFileName: req.file.originalname,
        fileSize: req.file.size,
        uploadedAt: new Date()
      },
      googleSheet: {
        webAppUrl: 'LOCAL_EXCEL',
        sheetName,
        materialSheetName: materialSheetName || '',
        verifiedAt: new Date(),
        verifiedTabs: parsed.sheetNames,
        ...(normalizedHints ? { inputHints: normalizedHints } : {}),
        ...(Array.isArray(defaultPrintPages) && defaultPrintPages.length > 0 ? { defaultPrintPages } : {}),
        ...(customCellStyles && Object.keys(customCellStyles).length > 0 ? { customCellStyles } : {})
      }
    });

    await template.save();

    // Persist workbook file safely (handles Linux permissions, falls back to temp directory + base64)
    const { filePath, base64Data } = persistTemplateWorkbook(template._id, req.file.buffer);

    template.excelWorkbook.filePath = filePath || `uploads/templates/${template._id}.xlsx`;
    template.excelWorkbook.base64Data = base64Data;
    await template.save();

    // Save blueprint to TemplateSheetStructure collection
    const byteSize = Buffer.byteLength(JSON.stringify({ blueprint, materialBlueprint }));
    await TemplateSheetStructure.findOneAndUpdate(
      { templateId: template._id },
      {
        $set: {
          templateId: template._id,
          webAppUrl: 'LOCAL_EXCEL',
          sheetName,
          blueprint,
          materialSheetName: materialSheetName || '',
          materialBlueprint,
          fetchedAt: new Date(),
          byteSize
        }
      },
      { new: true, upsert: true }
    );

    // Initialize pricing record
    await new TemplatePricing({ templateId: template._id }).save().catch(() => {});

    res.status(201).json({
      ok: true,
      template,
      warnings: []
    });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * PUT /api/sheets/excel/:id
 *
 * Updates an EXCEL template, with optional replacement of the .xlsx workbook file.
 */
router.put('/excel/:id', upload.single('excelFile'), async (req, res) => {
  try {
    const template = await resolveSheetTemplate(req.params.id);
    const {
      name, productName, description,
      sheetName, materialSheetName,
      inputHints: rawHints,
      defaultPrintPages: rawPages,
      customCellStyles: rawStyles
    } = req.body;

    if (name) template.name = name.trim();
    if (productName) template.productName = productName.trim();
    if (description !== undefined) template.description = description;

    const inputHints = typeof rawHints === 'string' ? JSON.parse(rawHints) : rawHints;
    const defaultPrintPages = typeof rawPages === 'string' ? JSON.parse(rawPages) : rawPages;
    const customCellStyles = typeof rawStyles === 'string' ? JSON.parse(rawStyles) : rawStyles;

    const normalizedHints = normalizeHints(inputHints);
    if (normalizedHints) template.googleSheet.inputHints = normalizedHints;
    if (Array.isArray(defaultPrintPages)) template.googleSheet.defaultPrintPages = defaultPrintPages;
    if (customCellStyles !== undefined) {
      template.googleSheet.customCellStyles = customCellStyles;
      template.markModified('googleSheet.customCellStyles');
      template.markModified('googleSheet');
    }
    if (sheetName) template.googleSheet.sheetName = sheetName;
    if (materialSheetName !== undefined) template.googleSheet.materialSheetName = materialSheetName;

    // Handle new workbook file upload if supplied
    if (req.file && req.file.buffer) {
      const { filePath, base64Data } = persistTemplateWorkbook(template._id, req.file.buffer);

      template.excelWorkbook = {
        originalFileName: req.file.originalname,
        filePath: filePath || `uploads/templates/${template._id}.xlsx`,
        fileSize: req.file.size,
        uploadedAt: new Date(),
        base64Data
      };

      const parsed = parseExcelWorkbook(req.file.buffer);
      const blueprint = parsed.sheets[template.googleSheet.sheetName] || null;
      const materialBlueprint = template.googleSheet.materialSheetName
        ? (parsed.sheets[template.googleSheet.materialSheetName] || null)
        : null;

      const byteSize = Buffer.byteLength(JSON.stringify({ blueprint, materialBlueprint }));
      await TemplateSheetStructure.findOneAndUpdate(
        { templateId: template._id },
        {
          $set: {
            templateId: template._id,
            webAppUrl: 'LOCAL_EXCEL',
            sheetName: template.googleSheet.sheetName,
            blueprint,
            materialSheetName: template.googleSheet.materialSheetName || '',
            materialBlueprint,
            fetchedAt: new Date(),
            byteSize
          }
        },
        { new: true, upsert: true }
      );
    }

    await template.save();
    res.json({ ok: true, template });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * POST /api/sheets/templates/:id/calculate
 *   Body: { orderNo?, windows:[{width,height}] }
 *      OR { orderNo?, lineItems:[{qty,measurements}] }
 *
 * Accepts both call shapes so the sheet calculator panel (explicit windows) and
 * the ERP flows (line items) can share the same endpoint.
 * Dispatches to runExcelEngine for EXCEL templates, or runSheetEngine for GOOGLE_SHEET.
 */
router.post('/templates/:id/calculate', async (req, res) => {
  try {
    const template = await resolveSheetTemplate(req.params.id);
    const { orderNo, windows, lineItems } = req.body || {};

    const result = template.templateType === 'EXCEL'
      ? await runExcelEngine(template, { orderNo, windows, lineItems })
      : await runSheetEngine(template, { orderNo, windows, lineItems });

    res.json({ ok: true, ...result });
  } catch (err) {
    try { await recordSheetError(req.params.id, err.message); } catch {}
    sendError(res, err);
  }
});

/**
 * GET /api/sheets/templates/:id/structure?refresh=1
 *
 * Returns the cached blueprint. With ?refresh=1 it re-fetches or re-parses from disk.
 */
router.get('/templates/:id/structure', async (req, res) => {
  try {
    const template = await resolveSheetTemplate(req.params.id);

    if (req.query.refresh === '1') {
      if (template.templateType === 'EXCEL') {
        const fileBuffer = await getTemplateBuffer(template);
        const parsed = parseExcelWorkbook(fileBuffer);
        const blueprint = parsed.sheets[template.googleSheet?.sheetName] || null;
        const materialBlueprint = template.googleSheet?.materialSheetName
          ? parsed.sheets[template.googleSheet.materialSheetName] || null
          : null;
        const byteSize = Buffer.byteLength(JSON.stringify({ blueprint, materialBlueprint }));
        const doc = await TemplateSheetStructure.findOneAndUpdate(
          { templateId: template._id },
          {
            $set: {
              templateId: template._id,
              webAppUrl: 'LOCAL_EXCEL',
              sheetName: template.googleSheet?.sheetName,
              blueprint,
              materialSheetName: template.googleSheet?.materialSheetName || '',
              materialBlueprint,
              fetchedAt: new Date(),
              byteSize
            }
          },
          { new: true, upsert: true }
        );
        return res.json({ ok: true, structure: doc, warnings: [], tabsFound: parsed.sheetNames, customCellStyles: template.googleSheet?.customCellStyles || {} });
      } else {
        const { doc, warnings, tabsFound } = await refreshStructure(template);
        return res.json({ ok: true, structure: doc, warnings, tabsFound, customCellStyles: template.googleSheet?.customCellStyles || {} });
      }
    }

    const cached = await getStructure(template._id);
    if (!cached) {
      return res.status(404).json({
        ok: false,
        error: { kind: 'NOT_CACHED', message: 'No cached structure for this template. Click "Refresh structure" to fetch it.', status: 404, snippet: null }
      });
    }
    res.json({ ok: true, structure: cached, customCellStyles: template.googleSheet?.customCellStyles || {} });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * POST /api/sheets/templates/:id/material-mapping
 *   Body: { mode, blocks, glassBlock }
 *
 * Persists user-edited material mapping overrides so the block detector's
 * output can be corrected without re-deploying Code.gs.
 */
router.post('/templates/:id/material-mapping', async (req, res) => {
  try {
    const template = await resolveSheetTemplate(req.params.id);
    const { mode, blocks, glassBlock } = req.body || {};

    const update = {};
    if (mode !== undefined) update['googleSheet.materialMapping.mode'] = mode;
    if (blocks !== undefined) update['googleSheet.materialMapping.blocks'] = blocks;
    if (glassBlock !== undefined) update['googleSheet.materialMapping.glassBlock'] = glassBlock;

    const updated = await Template.findByIdAndUpdate(
      template._id,
      { $set: update },
      { new: true }
    );

    res.json({ ok: true, materialMapping: updated.googleSheet.materialMapping });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * POST /api/sheets/templates/:id/print-settings
 *   Body: { defaultPrintPages }
 *
 * Persists Excel-style default print pages configuration (multi-page cell selections,
 * orientation, scaling) for 1-click production card printing.
 */
router.post('/templates/:id/print-settings', async (req, res) => {
  try {
    const template = await resolveSheetTemplate(req.params.id);
    const { defaultPrintPages = [] } = req.body || {};

    const updated = await Template.findByIdAndUpdate(
      template._id,
      { $set: { 'googleSheet.defaultPrintPages': defaultPrintPages } },
      { new: true }
    );

    res.json({ ok: true, defaultPrintPages: updated.googleSheet.defaultPrintPages || [] });
  } catch (err) {
    sendError(res, err);
  }
});

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Loads and validates a GOOGLE_SHEET template by ObjectId, code or name.
 * Rejects non-GOOGLE_SHEET templates with a 422 so the caller always gets a
 * meaningful message rather than a confusing "no webAppUrl" error downstream.
 */
async function resolveSheetTemplate(idParam) {
  let template = null;
  if (mongoose.Types.ObjectId.isValid(idParam)) {
    template = await Template.findById(idParam);
  }
  if (!template) template = await Template.findOne({ code: idParam });
  if (!template) template = await Template.findOne({ name: idParam });

  if (!template) {
    throw Object.assign(new Error('Template not found.'), { status: 404, kind: 'NOT_FOUND' });
  }
  if (template.templateType !== 'GOOGLE_SHEET' && template.templateType !== 'EXCEL') {
    throw Object.assign(
      new Error(`Template "${template.name}" is type ${template.templateType}, not GOOGLE_SHEET or EXCEL.`),
      { status: 422, kind: 'WRONG_TYPE' }
    );
  }
  return template;
}

export default router;


