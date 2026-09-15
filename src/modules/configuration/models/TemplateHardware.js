import mongoose from 'mongoose';

const TemplateHardwareSchema = new mongoose.Schema({
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template', required: true },
  hardwareName: { type: String, required: true },
  formulaId: { type: mongoose.Schema.Types.ObjectId, ref: 'TemplateFormula' },
  qty: { type: Number, default: 1 },
  unit: { type: String, default: 'Nos' },
  group: { type: String, default: 'Hardware' }
});

export default mongoose.model('TemplateHardware', TemplateHardwareSchema);
