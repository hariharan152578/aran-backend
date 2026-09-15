import mongoose from 'mongoose';

const TemplateVersionSchema = new mongoose.Schema({
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template', required: true },
  version: { type: String, required: true },
  snapshot: { type: Object, required: true }, // Store entire snapshot of measurements, formulas, bom, etc.
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('TemplateVersion', TemplateVersionSchema);
