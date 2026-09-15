import mongoose from 'mongoose';

/**
 * Cached layout blueprint for a GOOGLE_SHEET template's tabs.
 *
 * WHY THIS IS CACHED AT ALL
 * The Apps Script POST response carries cell VALUES only (Code.gs
 * readEntireSheet returns range.getValues()). Merged ranges, formula flags,
 * bold, fills and number formats exist solely in the ?action=structure
 * response. Without a stored blueprint, rendering a calculated sheet would
 * need a second Apps Script round trip - doubling latency and quota use - on
 * every single calculation.
 *
 * WHY IT LIVES IN ITS OWN COLLECTION RATHER THAN ON Template
 * getTemplates() returns every template in a folder and is called by the
 * Explorer grid and the quotation item picker. A single blueprint is ~22KB for
 * a small 16x10 sheet and several times that for a real one, so inlining it
 * would make those listings download hundreds of KB of cell metadata they
 * never read.
 *
 * STALENESS
 * Refreshed only on explicit request (the "Refresh structure" button), never on
 * a timer. The blueprint is the layout the user visually verified when saving
 * the template; silently swapping it for a changed one would move values into
 * different cells with no indication that anything happened.
 */
const TemplateSheetStructureSchema = new mongoose.Schema({
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template', required: true, unique: true },

  // Denormalised from Template.googleSheet so a stale cache is detectable: if
  // either differs from the template's current values, this blueprint describes
  // a different target and must be refetched.
  webAppUrl: { type: String, required: true },
  sheetName: { type: String, required: true },

  // Raw Apps Script payload for the calculation tab, exactly as returned:
  // { dimensions, max_row, max_col, merged_ranges, input_field_hints, cells }.
  // Kept as Mixed deliberately - it is an opaque rendering input, and enumerating
  // a schema for arbitrary cell addresses would buy nothing.
  blueprint: { type: mongoose.Schema.Types.Mixed, required: true },

  // The consumed-material tab, if the template has one. Its name varies per
  // workbook ("Material & Hardware", "Profile & Hardwares"), hence storing it.
  materialSheetName: { type: String, default: '' },
  materialBlueprint: { type: mongoose.Schema.Types.Mixed, default: null },

  fetchedAt: { type: Date, default: Date.now },

  // Guards against the 16MB BSON document limit; refreshStructure refuses well
  // short of it with a message naming the tab's used range.
  byteSize: { type: Number, default: 0 }
}, { timestamps: true });

export default mongoose.model('TemplateSheetStructure', TemplateSheetStructureSchema);
