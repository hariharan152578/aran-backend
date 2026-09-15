import mongoose from 'mongoose';

const CellSchema = new mongoose.Schema({
  sheet: { type: String, required: true },
  address: { type: String, required: true },
  value: { type: mongoose.Schema.Types.Mixed },
  format: { type: String }
}, { _id: false });

const FormulaSchema = new mongoose.Schema({
  sheet: { type: String, required: true },
  address: { type: String, required: true },
  formula: { type: String, required: true }
}, { _id: false });

const MergedCellSchema = new mongoose.Schema({
  sheet: { type: String, required: true },
  s: {
    c: { type: Number, required: true },
    r: { type: Number, required: true }
  },
  e: {
    c: { type: Number, required: true },
    r: { type: Number, required: true }
  }
}, { _id: false });

const SheetMetaSchema = new mongoose.Schema({
  name: { type: String, required: true },
  index: { type: Number, required: true },
  hidden: { type: Boolean, default: false }
}, { _id: false });

const WorkbookScanSchema = new mongoose.Schema({
  fileName: { type: String, required: true },
  sheets: [SheetMetaSchema],
  cells: [CellSchema],
  formulas: [FormulaSchema],
  mergedCells: [MergedCellSchema],
  statistics: {
    totalSheets: { type: Number, default: 0 },
    totalCells: { type: Number, default: 0 },
    totalFormulas: { type: Number, default: 0 },
    totalMerged: { type: Number, default: 0 },
    processingTimeMs: { type: Number, default: 0 }
  },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('WorkbookScan', WorkbookScanSchema, 'configuration_workbook_scans');
