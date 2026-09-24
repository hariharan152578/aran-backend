import mongoose from 'mongoose';

const InvoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true, unique: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  quotationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quotation' },
  orderRef: { type: String },
  customerName: { type: String, required: true },
  amount: { type: Number, required: true },
  amountReceived: { type: Number, default: 0 },
  paymentMethod: { type: String, default: 'Bank Transfer' },
  status: { type: String, enum: ['Unpaid', 'Partially Paid', 'Paid'], default: 'Unpaid' },
  dueDate: { type: Date, required: true }
}, { timestamps: true });

export default mongoose.model('Invoice', InvoiceSchema);
