import mongoose from 'mongoose';

const ExpenseSchema = new mongoose.Schema({
  expenseNumber: { type: String, required: true, unique: true },
  category: { type: String, required: true }, // e.g. Factory rent, Power, Raw Materials, Salaries
  amount: { type: Number, required: true },
  date: { type: Date, default: Date.now },
  description: { type: String }
}, { timestamps: true });

export default mongoose.model('Expense', ExpenseSchema);
