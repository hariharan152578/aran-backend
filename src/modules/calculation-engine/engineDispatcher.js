/**
 * The single fork between the two calculation engines.
 *
 * GOOGLE_SHEET templates delegate their arithmetic to a real spreadsheet;
 * everything else keeps running the JSON_RULES evaluator exactly as before.
 * Both return the same contract, so no caller has to care which ran.
 *
 * For a non-GOOGLE_SHEET template this ends in the identical
 * `runProductionEngine(templateId, lineItems)` call the four call sites made
 * directly before, so existing behaviour is unchanged.
 */

import mongoose from 'mongoose';
import Template from '../configuration/models/Template.js';
import { runProductionEngine } from './evaluator.js';
import { runSheetEngine } from '../sheets/sheetEngine.js';

/**
 * Resolves a template from an id, a code, a name, or an already-loaded document.
 *
 * The fallback chain exists because Order.lineItems[].templateId and
 * ProductionCard.templateId are Mixed - historically they hold a code or a name
 * as often as an ObjectId. The same ObjectId -> code -> name chain was already
 * written inline in TemplateController.simulateTemplate and twice in
 * production/router.js; this is that logic in one place.
 */
export async function resolveTemplate(idOrDoc) {
  if (!idOrDoc) return null;

  // Already a Mongoose document or a lean object with the field we dispatch on.
  if (typeof idOrDoc === 'object' && idOrDoc._id && 'templateType' in idOrDoc) return idOrDoc;

  const key = String(idOrDoc?._id || idOrDoc);
  if (!key || key === '[object Object]') return null;

  if (mongoose.Types.ObjectId.isValid(key)) {
    const byId = await Template.findById(key);
    if (byId) return byId;
  }
  return (await Template.findOne({ code: key })) || (await Template.findOne({ name: key }));
}

/**
 * Runs whichever engine the template calls for.
 *
 * @param idOrDoc   template id, code, name, or document
 * @param lineItems [{ windowNo, qty, measurements }]
 * @param opts      { orderNo, windows } - only meaningful for GOOGLE_SHEET
 * @returns { totalBomConsumption, cuttingList, glassList, hardwareList, simulationData }
 *          plus, for GOOGLE_SHEET, { sheetResult, warnings }
 */
export async function runEngine(idOrDoc, lineItems, opts = {}) {
  const template = await resolveTemplate(idOrDoc);

  if (template?.templateType === 'GOOGLE_SHEET') {
    return runSheetEngine(template, { lineItems, ...opts });
  }

  // Unchanged legacy path. evaluator.js queries its collections by templateId,
  // so it needs the id - pass the resolved _id when we have one, otherwise the
  // original argument so a previously-working call cannot start failing here.
  return runProductionEngine(template?._id || idOrDoc, lineItems);
}
