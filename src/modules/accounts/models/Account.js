import mongoose from 'mongoose';

const AccountSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  type: { type: String, enum: ['Cash', 'Bank', 'UPI'], default: 'Bank' },
  openingBalance: { type: Number, default: 0 },
  asOfDate: { type: Date, default: Date.now },
  accountNumber: { type: String },
  accountHolderName: { type: String },
  ifscCode: { type: String },
  bankName: { type: String },
  branchName: { type: String },
  upiId: { type: String },
  isDefault: { type: Boolean, default: false }
}, { timestamps: true });

export default mongoose.model('Account', AccountSchema);
