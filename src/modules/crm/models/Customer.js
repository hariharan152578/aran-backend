import mongoose from 'mongoose';

const CustomerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  company: { type: String },
  email: { type: String },
  phone: { type: String, required: true },
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  mobileNumber: { type: String },
  openingBalance: { type: Number, default: 0 },
  balanceType: { type: String, enum: ['To Collect', 'To Pay'], default: 'To Collect' },
  gstin: { type: String },
  panNumber: { type: String },
  partyType: { type: String, enum: ['Customer', 'Vendor'], default: 'Customer' },
  partyCategory: { type: String },
  billingAddress: { type: String },
  shippingAddress: { type: String },
  creditPeriod: { type: Number, default: 30 },
  creditLimit: { type: Number, default: 0 },
  contactPersonName: { type: String },
  contactCustomFields: [{
    label: String,
    value: String
  }],
  bankAccounts: [{
    accountHolderName: String,
    accountNumber: String,
    bankName: String,
    ifscCode: String
  }]
}, { timestamps: true });

export default mongoose.model('Customer', CustomerSchema);
