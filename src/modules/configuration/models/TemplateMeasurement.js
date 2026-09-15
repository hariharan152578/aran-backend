import mongoose from 'mongoose';

const TemplateMeasurementSchema = new mongoose.Schema({
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template', required: true },
  fieldName: { type: String, required: true },
  type: { type: String, enum: ['number', 'text', 'dropdown', 'checkbox', 'date'], default: 'number' },
  required: { type: Boolean, default: true },
  defaultValue: { type: mongoose.Schema.Types.Mixed },
  options: [{ type: String }],
  min: { type: Number },
  max: { type: Number },
  visible: { type: Boolean, default: true },
  order: { type: Number, default: 0 }
});

export default mongoose.model('TemplateMeasurement', TemplateMeasurementSchema);
