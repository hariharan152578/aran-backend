/**
 * Turns raw Apps Script structure payloads into the two shapes the rest of the
 * app wants:
 *
 *   summariseStructure()  - a small tab list for the Verify step. Deliberately
 *                           drops `cells`, which is the bulk of the payload and
 *                           is useless for choosing a tab.
 *   refreshStructure()    - persists the full blueprint for the chosen tabs, so
 *                           rendering never needs a second Apps Script round
 *                           trip. The POST response carries values only.
 */

import Template from '../configuration/models/Template.js';
import TemplateSheetStructure from '../configuration/models/TemplateSheetStructure.js';
import { fetchStructure } from './appsScriptClient.js';

/** Mongo documents cap at 16MB; refuse well short of it with a clear message. */
const MAX_BLUEPRINT_BYTES = 12 * 1024 * 1024;

/** Tabs whose name suggests they hold consumed-material totals. */
const MATERIAL_NAME_RE = /material|hardware|hardwares|profile|consum/i;

function columnLetterToIndex(letter) {
  let index = 0;
  for (const ch of String(letter || '').toUpperCase()) {
    if (ch < 'A' || ch > 'Z') return 0;
    index = index * 26 + (ch.charCodeAt(0) - 64);
  }
  return index;
}

/**
 * A tab is calculable when Apps Script found both a Width and a Height header,
 * which is exactly what doPost needs to write into. Helper tabs (material
 * lists, rate cards) have no such headers and get null hints.
 */
function isCalculable(hints) {
  return !!(hints && hints.width_col && hints.height_col);
}

/**
 * Flags input columns that look like they came from the wrong block.
 *
 * Older deployments of Code.gs let the LAST matching header win, so on a tab
 * with several Width/Height pairs (customer inputs, then derived cut/sash/glass
 * /steel sizes) detection landed on the bottom-most one - on a real OP-OP sheet
 * it picked width=N, height=P, header_row=24, the steel-cutting block. doPost
 * would then write customer dimensions into the wrong table and mis-calculate
 * with no error shown.
 *
 * The fixed Code.gs in backend/apps-script/ prefers the earliest complete
 * header row, but templates may point at deployments that haven't been updated.
 * Every real input block observed sits in the first few columns within the
 * first handful of rows, so anything further out is worth a warning in the tab
 * picker before the user saves.
 */
function hintWarning(hints) {
  if (!isCalculable(hints)) return null;

  const widthIdx = columnLetterToIndex(hints.width_col);
  const heightIdx = columnLetterToIndex(hints.height_col);
  const headerRow = Number(hints.header_row) || 0;

  if (widthIdx > 6 || heightIdx > 6 || headerRow > 10) {
    return `Detected input columns ${hints.width_col}/${hints.height_col} at row ${headerRow}, which is further into the sheet than expected. If this tab has more than one Width/Height block, the wrong one may have been picked - deploy the updated Code.gs from backend/apps-script/ and verify again.`;
  }
  return null;
}

/**
 * Compact per-tab summary for the Verify Connection step.
 *
 * Calculable tabs are listed first so the picker can preselect a sensible
 * default, matching how the prototype console ordered its tab strip.
 */
export function summariseStructure(sheets) {
  const tabs = Object.entries(sheets || {}).map(([name, sheet]) => {
    const hints = sheet?.input_field_hints || null;
    const calculable = isCalculable(hints);
    return {
      name,
      calculable,
      maxRow: sheet?.max_row ?? 0,
      maxCol: sheet?.max_col ?? 0,
      cellCount: sheet?.cells ? Object.keys(sheet.cells).length : 0,
      mergedCount: Array.isArray(sheet?.merged_ranges) ? sheet.merged_ranges.length : 0,
      isMaterialCandidate: !calculable && MATERIAL_NAME_RE.test(name),
      inputHints: calculable ? hints : null,
      warning: hintWarning(hints)
    };
  });

  tabs.sort((a, b) => (b.calculable - a.calculable) || a.name.localeCompare(b.name));

  const firstCalculable = tabs.find(t => t.calculable);
  const firstMaterial = tabs.find(t => t.isMaterialCandidate);

  return {
    tabs,
    suggested: {
      sheetName: firstCalculable?.name || '',
      // Empty string, not undefined: the modal binds it to a <select> value.
      materialSheetName: firstMaterial?.name || ''
    }
  };
}

/** Maps Apps Script's snake_case hints onto the Template.googleSheet.inputHints shape. */
export function toInputHints(hints) {
  if (!isCalculable(hints)) {
    return { wNoCol: null, widthCol: null, heightCol: null, headerRow: null, dataStartRow: null, dataEndRow: null };
  }
  return {
    wNoCol: hints.w_no_col || null,
    widthCol: hints.width_col || null,
    heightCol: hints.height_col || null,
    headerRow: hints.header_row ?? null,
    dataStartRow: hints.data_start_row ?? null,
    dataEndRow: hints.data_end_row ?? null
  };
}

/**
 * Fetches the blueprint for a template's chosen tabs and upserts the cache.
 *
 * Asks for every tab in one request rather than one request per tab: it is a
 * single Apps Script invocation against the daily quota, and the material tab
 * is usually needed alongside the calculation tab anyway.
 */
export async function refreshStructure(template) {
  const { webAppUrl, sheetName, materialSheetName } = template.googleSheet || {};
  if (!webAppUrl) throw Object.assign(new Error('Template has no Google Sheet URL.'), { status: 422 });
  if (!sheetName) throw Object.assign(new Error('Template has no sheet tab selected.'), { status: 422 });

  const { sheets } = await fetchStructure(webAppUrl);

  const blueprint = sheets[sheetName];
  if (!blueprint) {
    throw Object.assign(
      new Error(`Tab "${sheetName}" no longer exists in this workbook. Tabs found: ${Object.keys(sheets).join(', ')}.`),
      { status: 422 }
    );
  }

  const warnings = [];
  let materialBlueprint = null;
  if (materialSheetName) {
    materialBlueprint = sheets[materialSheetName] || null;
    if (!materialBlueprint) {
      warnings.push(`Material tab "${materialSheetName}" was not found in this workbook, so BOM lists will be empty.`);
    }
  }

  const byteSize = Buffer.byteLength(JSON.stringify({ blueprint, materialBlueprint }));
  if (byteSize > MAX_BLUEPRINT_BYTES) {
    throw Object.assign(
      new Error(`This sheet's layout is too large to cache (${Math.round(byteSize / 1024 / 1024)}MB). Reduce the used range of the tab.`),
      { status: 413 }
    );
  }

  const doc = await TemplateSheetStructure.findOneAndUpdate(
    { templateId: template._id },
    {
      $set: {
        templateId: template._id,
        webAppUrl,
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

  // Keep the hints on the Template in step with what was just fetched: they are
  // shown in the UI and used to sanity-check a layout change.
  await Template.updateOne(
    { _id: template._id },
    {
      $set: {
        'googleSheet.inputHints': toInputHints(blueprint.input_field_hints),
        'googleSheet.verifiedAt': new Date(),
        'googleSheet.verifiedTabs': Object.keys(sheets),
        'googleSheet.lastError': ''
      }
    }
  );

  return { doc, warnings, tabsFound: Object.keys(sheets) };
}

import mongoose from 'mongoose';

/** Cached blueprint for a template, or null if it was never fetched. */
export async function getStructure(templateId) {
  if (!templateId) return null;
  let doc = null;
  if (mongoose.Types.ObjectId.isValid(templateId)) {
    doc = await TemplateSheetStructure.findOne({ templateId }).lean();
  }
  if (!doc) {
    const tmpl = await Template.findOne({ $or: [{ code: templateId }, { name: templateId }] });
    if (tmpl) {
      doc = await TemplateSheetStructure.findOne({ templateId: tmpl._id }).lean();
    }
  }
  return doc;
}
