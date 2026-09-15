import mongoose from 'mongoose';

const AuditLogSchema = new mongoose.Schema({
  action: { type: String, required: true },
  module: { type: String, required: true },
  user: { type: String, required: true },
  details: { type: String }
}, { timestamps: true });

export default mongoose.model('AuditLog', AuditLogSchema);
