import mongoose from 'mongoose';

const ExpenseSchema = new mongoose.Schema({
  expenseNumber: { type: String, required: true, unique: true },
  category: { type: String, required: true }, // e.g. Factory rent, Power, Raw Materials, Salaries
  amount: { type: Number, required: true },
  date: { type: Date, default: Date.now },
  description: { type: String },
  title: { type: String },
  paymentMethod: { type: String, default: 'Cash' },
  paidFromAccount: { type: String },
  paidFromAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
  notes: { type: String }
}, { timestamps: true });

export default mongoose.model('Expense', ExpenseSchema);
