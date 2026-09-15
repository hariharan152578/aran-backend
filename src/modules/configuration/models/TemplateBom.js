import mongoose from 'mongoose';

const TemplateBomSchema = new mongoose.Schema({
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template', required: true },
  materialName: { type: String, required: true },
  category: { type: String, enum: ['Profiles', 'Glass', 'Hardware', 'Accessories', 'Consumables', 'Labor'], default: 'Profiles' },
  formulaId: { type: mongoose.Schema.Types.ObjectId, ref: 'TemplateFormula' },
  unit: { type: String, default: 'Nos' },
  wastePercentage: { type: Number, default: 0 },
  remarks: { type: String },
  group: { type: String, default: 'Profiles' },
  barStockLength: { type: Number, default: 5850 },
  glassDeductionW: { type: Number, default: 100 },
  glassDeductionH: { type: Number, default: 100 }
});

export default mongoose.model('TemplateBom', TemplateBomSchema);
