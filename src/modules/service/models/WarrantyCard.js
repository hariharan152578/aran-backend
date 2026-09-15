import mongoose from 'mongoose';

const WarrantyCardSchema = new mongoose.Schema({
  warrantyNumber: { type: String, required: true, unique: true },
  orderId: { type: mongoose.Schema.Types.Mixed, ref: 'Order', required: true },
  customerName: { type: String, required: true },
  productDetails: { type: String },
  startDate: { type: Date, required: true, default: Date.now },
  durationYears: { type: Number, required: true, default: 5 },
  status: { type: String, enum: ['Active', 'Expired'], default: 'Active' }
}, { timestamps: true });

export default mongoose.model('WarrantyCard', WarrantyCardSchema);
