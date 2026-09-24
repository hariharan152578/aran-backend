import mongoose from 'mongoose';

const PaymentSchema = new mongoose.Schema({
  paymentNumber: { type: String, required: true },
  receiptNumber: { type: String }, // kept synced for backward compatibility
  partyName: { type: String, required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' }, // optional for legacy single-invoice
  settledInvoices: [{
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    invoiceNumber: String,
    orderNumber: String,
    invoiceAmount: { type: Number, default: 0 },
    amountReceived: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    date: Date,
    dueDate: Date,
    type: { type: String, default: 'Invoice' }
  }],
  totalAmountSettled: { type: Number, default: 0 },
  amountReceived: { type: Number, required: true },
  amountPaid: { type: Number }, // mirrored with amountReceived
  discount: { type: Number, default: 0 },
  paymentDate: { type: Date, default: Date.now },
  paymentMethod: { type: String, default: 'Cash' },
  paymentMode: { type: String, default: 'Cash' }, // Cash, UPI, Card, Netbanking, Bank Transfer, Cheque
  paymentReceivedIn: { type: String }, // Account / Bank / UPI ID
  notes: { type: String }
}, { timestamps: true });

PaymentSchema.pre('validate', function(next) {
  if (!this.paymentNumber && this.receiptNumber) {
    this.paymentNumber = this.receiptNumber;
  }
  if (!this.receiptNumber && this.paymentNumber) {
    this.receiptNumber = this.paymentNumber;
  }
  if (this.amountReceived != null && this.amountPaid == null) {
    this.amountPaid = this.amountReceived;
  } else if (this.amountPaid != null && this.amountReceived == null) {
    this.amountReceived = this.amountPaid;
  }
  if (this.paymentMethod && !this.paymentMode) {
    this.paymentMode = this.paymentMethod;
  } else if (this.paymentMode && !this.paymentMethod) {
    this.paymentMethod = this.paymentMode;
  }
  next();
});

export default mongoose.model('Payment', PaymentSchema);

