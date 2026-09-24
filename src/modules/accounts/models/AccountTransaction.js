import mongoose from 'mongoose';

const AccountTransactionSchema = new mongoose.Schema({
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
  accountName: { type: String, required: true },
  date: { type: Date, default: Date.now },
  type: { 
    type: String, 
    enum: ['Payment In', 'Expense', 'Add Money', 'Reduce Money', 'Transfer In', 'Transfer Out', 'Opening Balance'], 
    required: true 
  },
  txnNo: { type: String },
  partyName: { type: String },
  mode: { type: String, default: 'UPI' },
  paidAmount: { type: Number, default: 0 },
  receivedAmount: { type: Number, default: 0 },
  balanceAfter: { type: Number, default: 0 },
  remarks: { type: String },
  transferToAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
  transferToAccountName: { type: String },
  referencePaymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
  referenceExpenseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Expense' }
}, { timestamps: true });

export default mongoose.model('AccountTransaction', AccountTransactionSchema);
