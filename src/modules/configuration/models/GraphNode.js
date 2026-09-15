import mongoose from 'mongoose';

const GraphNodeSchema = new mongoose.Schema({
  scanId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkbookScan', required: true },
  sheet: { type: String, required: true },
  address: { type: String, required: true },
  type: { type: String, enum: ['CELL', 'FORMULA'], default: 'CELL' },
  rawFormula: { type: String }, // Present if type === 'FORMULA'
  value: { type: mongoose.Schema.Types.Mixed },
  classification: { type: String, enum: ['INPUT', 'AGGREGATE', 'RULE', 'MATERIAL', 'HARDWARE', null] },
  alias: { type: String },
  translatedFormula: { type: String },
  createdAt: { type: Date, default: Date.now }
});

// Index for fast lookups
GraphNodeSchema.index({ scanId: 1, sheet: 1, address: 1 }, { unique: true });

export default mongoose.model('GraphNode', GraphNodeSchema, 'configuration_graph_nodes');
