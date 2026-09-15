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
import { AppsScriptError, fetchStructure } from './appsScriptClient.js';
import { summariseStructure, refreshStructure, getStructure } from './structureService.js';
import { runSheetEngine, recordSheetError } from './sheetEngine.js';
import { lockStats } from './sheetLock.js';
import Template from '../configuration/models/Template.js';

const router = express.Router();

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
 * POST /api/sheets/templates/:id/calculate
 *   Body: { orderNo?, windows:[{width,height}] }
 *      OR { orderNo?, lineItems:[{qty,measurements}] }
 *
 * Accepts both call shapes so the sheet calculator panel (explicit windows) and
 * the ERP flows (line items) can share the same endpoint.
 *
 * On success returns the full sheetResult + the standard engine contract.
 * On failure records the error on the template (for the Overview panel) before
 * forwarding.
 */
router.post('/templates/:id/calculate', async (req, res) => {
  try {
    const template = await resolveSheetTemplate(req.params.id);
    const { orderNo, windows, lineItems } = req.body || {};

    const result = await runSheetEngine(template, { orderNo, windows, lineItems });
    res.json({ ok: true, ...result });
  } catch (err) {
    // Persist the error message so the template Overview panel can surface it
    // without requiring another calculation attempt.
    try { await recordSheetError(req.params.id, err.message); } catch {}
    sendError(res, err);
  }
});

/**
 * GET /api/sheets/templates/:id/structure?refresh=1
 *
 * Returns the cached blueprint. With ?refresh=1 it re-fetches from the Apps
 * Script web app first, which is the "Refresh structure" button's action.
 *
 * The blueprint is intentionally not returned on every GET /templates/:id
 * because it is large (~22KB+) and the listing endpoints must stay fast.
 */
router.get('/templates/:id/structure', async (req, res) => {
  try {
    const template = await resolveSheetTemplate(req.params.id);

    if (req.query.refresh === '1') {
      const { doc, warnings, tabsFound } = await refreshStructure(template);
      return res.json({ ok: true, structure: doc, warnings, tabsFound });
    }

    const cached = await getStructure(template._id);
    if (!cached) {
      return res.status(404).json({
        ok: false,
        error: { kind: 'NOT_CACHED', message: 'No cached structure for this template. Click "Refresh structure" to fetch it.', status: 404, snippet: null }
      });
    }
    res.json({ ok: true, structure: cached });
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
  if (template.templateType !== 'GOOGLE_SHEET') {
    throw Object.assign(
      new Error(`Template "${template.name}" is type ${template.templateType}, not GOOGLE_SHEET.`),
      { status: 422, kind: 'WRONG_TYPE' }
    );
  }
  return template;
}

export default router;


