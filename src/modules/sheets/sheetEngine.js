/**
 * The Google Sheets counterpart of calculation-engine/evaluator.js.
 *
 * runSheetEngine returns the SAME contract as runProductionEngine
 * ({ totalBomConsumption, cuttingList, glassList, hardwareList, simulationData })
 * so everything downstream - the ProductionCard model, the production
 * dashboard, cutting lists, material requirements, dispatch and reports - keeps
 * working untouched. The extra `sheetResult` field is additive, carrying the raw
 * grid for the sheet renderer.
 */

import Template from '../configuration/models/Template.js';
import { postOrder } from './appsScriptClient.js';
import { withSheetLock } from './sheetLock.js';
import { getStructure } from './structureService.js';
import { mapMaterialGrid, mapGlassBlock } from './materialGridMapper.js';

/**
 * Measurement keys vary by where the line item was created - the quotation item
 * modal, the order form and the production card modal each use a different one.
 * Same chain the existing UI already tries.
 */
function pickDimension(measurements, kind) {
  if (!measurements) return null;
  const keys = kind === 'width'
    ? ['widthMM', 'width', 'Width', 'Width (mm)', 'width_mm', 'W']
    : ['heightMM', 'height', 'Height', 'Height (mm)', 'height_mm', 'H'];

  for (const key of keys) {
    const n = Number(measurements[key]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/**
 * Flattens line items into one window row per physical unit.
 *
 * THIS EXPANSION IS NOT OPTIONAL. The sheet's profile maths uses CEILING, which
 * is not additive: H6 = CEILING(((SUM(widths)+SUM(heights))*2)/5850, 0.1).
 * Sending one row with qty=3 rounds a single combined length up once, while
 * three rows round the true total - and the two disagree. Collapsing rows
 * under-orders material. Code.gs grows its data block from the inside for
 * exactly this reason.
 */
export function lineItemsToWindows(lineItems = []) {
  const windows = [];
  const skipped = [];

  lineItems.forEach((item, index) => {
    const measurements = item?.measurements || item || {};
    const width = pickDimension(measurements, 'width');
    const height = pickDimension(measurements, 'height');
    const label = item?.windowNo || `Item ${index + 1}`;

    if (width === null || height === null) {
      skipped.push(label);
      return;
    }

    const qty = Math.max(1, Math.floor(Number(item?.qty) || 1));
    for (let i = 0; i < qty; i++) {
      windows.push({ width, height, sourceLabel: label });
    }
  });

  return { windows, skipped };
}

/**
 * Accepts either shape the callers use: an explicit windows array (the sheet
 * calculator panel) or ERP line items (simulate / production card generation).
 */
function resolveWindows({ windows, lineItems }) {
  if (Array.isArray(windows) && windows.length > 0) {
    const usable = windows
      .map(w => ({ width: Number(w.width), height: Number(w.height), sourceLabel: w.wNo || w.windowNo || null }))
      .filter(w => Number.isFinite(w.width) && w.width > 0 && Number.isFinite(w.height) && w.height > 0);
    return { windows: usable, skipped: [] };
  }
  return lineItemsToWindows(lineItems || []);
}

/**
 * Detects that the cached blueprint no longer describes the live sheet.
 *
 * Without this the failure is silent and nasty: the grid carries new values
 * while the blueprint describes the old layout, so values render in the wrong
 * cells and look plausible. Comparing row counts is cheap and catches the
 * common case of someone inserting or deleting rows in the spreadsheet.
 */
function detectLayoutDrift(blueprint, grid, expanded) {
  if (!blueprint || !grid || expanded) return null; // an expanded run legitimately differs

  const gridRows = grid.startRow + grid.values.length - 1;
  const blueprintRows = Number(blueprint.max_row) || 0;
  if (blueprintRows && gridRows !== blueprintRows) {
    return `The sheet now has ${gridRows} rows but this template was verified against ${blueprintRows}. The layout has changed - click "Refresh structure" so results line up with the right cells.`;
  }
  return null;
}

// In-flight promise map and short-term response cache to deduplicate simultaneous identical calculation calls
const inFlightEngines = new Map();
const recentCalculations = new Map();
const RECENT_TTL_MS = 20000; // 20 seconds

/**
 * Calculates one template against its Google Sheet.
 *
 * @param template  a GOOGLE_SHEET Template document
 * @param payload   { windows } or { lineItems }, plus optional orderNo
 */
export async function runSheetEngine(template, payload = {}) {
  const gs = template.googleSheet || {};
  const warnings = [];

  if (!gs.webAppUrl) {
    throw Object.assign(new Error('This template has no Google Sheet URL. Edit it and verify a connection.'), { status: 422 });
  }
  if (!gs.sheetName) {
    throw Object.assign(new Error('This template has no sheet tab selected.'), { status: 422 });
  }

  const { windows, skipped } = resolveWindows(payload);
  if (windows.length === 0) {
    throw Object.assign(
      new Error('No usable window dimensions were supplied. Each window needs a width and a height.'),
      { status: 422 }
    );
  }
  if (skipped.length > 0) {
    warnings.push(`Skipped ${skipped.length} item(s) with no width/height: ${skipped.join(', ')}.`);
  }

  const orderNo = payload.orderNo || 'ORD-SIM';
  const cacheKey = `${template._id || template.code}:${gs.sheetName}:${orderNo}:${JSON.stringify(windows)}`;

  // Return recent result if available within TTL
  const cachedHit = recentCalculations.get(cacheKey);
  if (cachedHit && (Date.now() - cachedHit.timestamp < RECENT_TTL_MS)) {
    return cachedHit.data;
  }

  // Join in-flight execution if an identical calculation is already running
  if (inFlightEngines.has(cacheKey)) {
    return await inFlightEngines.get(cacheKey);
  }

  const calculationPromise = (async () => {
    // Serialise per workbook: doPost writes, flushes, reads, then wipes shared
    // cells, so overlapping runs read each other's inputs.
    const raw = await withSheetLock(gs.webAppUrl, () => postOrder(
      gs.webAppUrl,
      {
        sheetName: gs.sheetName,
        orderNo,
        materialSheetName: gs.materialSheetName || '',
        windows
      }
    ));

    if (raw.warning) warnings.push(raw.warning);

    const cached = await getStructure(template._id);
    // An expanded run returns a fresh blueprint reflecting the grown block, and
    // that always wins - the cached one describes fewer rows and a totals row in
    // the wrong place.
    const expanded = !!raw.expandedSheet;
    const sheet = raw.expandedSheet || cached?.blueprint || null;
    const materialSheet = cached?.materialBlueprint || null;

    if (!sheet) {
      warnings.push('No cached layout for this template, so the sheet cannot be rendered. Click "Refresh structure".');
    }

    const drift = detectLayoutDrift(cached?.blueprint, raw.grid, expanded);
    if (drift) warnings.push(drift);

    if (gs.materialSheetName && !raw.materialGrid) {
      warnings.push(`The spreadsheet returned no data for material tab "${gs.materialSheetName}", so BOM lists are empty. If the deployment is older than this template, redeploy the Code.gs from backend/apps-script/.`);
    }
    if (!gs.materialSheetName) {
      warnings.push('No material tab is configured for this template, so BOM lists are empty.');
    }

    const mapped = mapMaterialGrid(raw.materialGrid, gs.materialMapping || {}, { warnings });

    // Glass panes come from the CALCULATION grid - the material tab has no
    // per-pane dimensions. Opt-in; see mapGlassBlock.
    const glassList = gs.materialMapping?.glassBlock?.enabled
      ? mapGlassBlock(raw.grid, gs.materialMapping.glassBlock)
      : [];

    // One entry per SOURCE line item (not per expanded window), matching what the
    // legacy engine reports.
    const simulationData = (payload.lineItems || []).map((item, index) => ({
      windowNo: item?.windowNo || `Item ${index + 1}`,
      scope: {
        width: pickDimension(item?.measurements || {}, 'width'),
        height: pickDimension(item?.measurements || {}, 'height')
      },
      results: []
    }));

    const defaultPrintPages = gs.defaultPrintPages || template.defaultPrintPages || [];

    const resultData = {
      templateId: template._id,
      templateCode: template.code,
      templateName: template.name,
      defaultPrintPages,
      totalBomConsumption: mapped.totalBomConsumption,
      cuttingList: mapped.cuttingList,
      hardwareList: mapped.hardwareList,
      glassList,
      simulationData,
      warnings,
      sheetResult: {
        sheetName: raw.sheetName,
        sheet,
        grid: raw.grid,
        materialSheetName: raw.materialSheetName || gs.materialSheetName || null,
        materialSheet,
        materialGrid: raw.materialGrid || null,
        inputColumnsUsed: raw.inputColumnsUsed || null,
        durationMs: raw.durationMs || 0,
        defaultPrintPages,
        calculatedAt: new Date().toISOString()
      }
    };

    // Cache successful run
    recentCalculations.set(cacheKey, { timestamp: Date.now(), data: resultData });
    // Clean up old cache entries
    if (recentCalculations.size > 100) {
      const now = Date.now();
      for (const [k, v] of recentCalculations.entries()) {
        if (now - v.timestamp > RECENT_TTL_MS) recentCalculations.delete(k);
      }
    }

    // Bookkeeping only - never let it fail or slow the response.
    Template.updateOne(
      { _id: template._id },
      { $set: { 'googleSheet.lastCalculatedAt': new Date(), 'googleSheet.lastError': '' } }
    ).catch(() => {});

    return resultData;
  })();

  inFlightEngines.set(cacheKey, calculationPromise);
  try {
    return await calculationPromise;
  } finally {
    inFlightEngines.delete(cacheKey);
  }
}

/** Records why a calculation failed so the template Overview can surface it. */
export async function recordSheetError(templateId, message) {
  try {
    await Template.updateOne(
      { _id: templateId },
      { $set: { 'googleSheet.lastError': String(message || '').slice(0, 500) } }
    );
  } catch {
    // Diagnostics only - never mask the original failure.
  }
}
