import mongoose from 'mongoose';

const ImportLogSchema = new mongoose.Schema({
  fileName: { type: String, required: true },
  status: { type: String, enum: ['SUCCESS', 'FAILED'], required: true },
  createdTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template' },
  errorDetails: { type: String },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('ImportLog', ImportLogSchema);
