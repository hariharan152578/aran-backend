import mongoose from 'mongoose';

const PaymentSchema = new mongoose.Schema({
  receiptNumber: { type: String, required: true, unique: true },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true },
  amountPaid: { type: Number, required: true },
  paymentDate: { type: Date, default: Date.now },
  paymentMethod: { type: String, default: 'Bank Transfer' }
}, { timestamps: true });

export default mongoose.model('Payment', PaymentSchema);
