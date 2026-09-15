import mongoose from 'mongoose';

const TemplateFormulaSchema = new mongoose.Schema({
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template', required: true },
  name: { type: String, required: true },
  formula: { type: String, required: true },
  unit: { type: String, default: 'Nos' },
  isInternal: { type: Boolean, default: false },
  description: { type: String, default: '' },
  group: { type: String, default: 'General' }
});

export default mongoose.model('TemplateFormula', TemplateFormulaSchema);
