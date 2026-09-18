import mongoose from 'mongoose';

const DismissedDispatchSchema = new mongoose.Schema({
  batchId: { type: String, required: true, unique: true, index: true },
  orderId: { type: String },
  dispatchNumber: { type: String },
  dismissedAt: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.models.DismissedDispatch || mongoose.model('DismissedDispatch', DismissedDispatchSchema);
