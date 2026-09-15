import mongoose from 'mongoose';

const AMCSchema = new mongoose.Schema({
  amcNumber: { type: String, required: true, unique: true },
  customerName: { type: String, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  fee: { type: Number, required: true },
  status: { type: String, enum: ['Active', 'Expired'], default: 'Active' }
}, { timestamps: true });

export default mongoose.model('AMC', AMCSchema);
