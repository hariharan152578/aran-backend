import mongoose from 'mongoose';

const GraphEdgeSchema = new mongoose.Schema({
  scanId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkbookScan', required: true },
  sourceNodeId: { type: mongoose.Schema.Types.ObjectId, ref: 'GraphNode', required: true },
  targetNodeId: { type: mongoose.Schema.Types.ObjectId, ref: 'GraphNode', required: true },
  sourceAddress: { type: String, required: true }, // e.g. B15
  targetAddress: { type: String, required: true }, // e.g. H6
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('GraphEdge', GraphEdgeSchema, 'configuration_graph_edges');
