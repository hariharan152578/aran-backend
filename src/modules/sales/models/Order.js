import mongoose from 'mongoose';

const OrderSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true }, // Replaces orderNumber to match frontend id mapping
  quotationRef: { type: String },
  date: { type: String }, // Frontend usually stores locale string
  party: { type: mongoose.Schema.Types.Mixed }, // Matches Quotation
  amount: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  amountPaid: { type: Number, default: 0 },
  paymentStatus: { type: String, enum: ['Unpaid', 'Partial Paid', 'Paid'], default: 'Unpaid' },
  transactions: [{
    amount: { type: Number, required: true },
    paymentMode: { type: String, default: 'Cash' },
    date: { type: Date, default: Date.now },
    reference: { type: String }
  }],
  status: { type: String, enum: ['Processing', 'In Production', 'Completed', 'Dispatched', 'Cancelled'], default: 'Processing' },
  
  lineItems: [{
    templateId: { type: String },
    templateCode: { type: String },
    templateName: { type: String },
    name: { type: String }, // Used as fallback in frontend
    price: { type: Number, default: 0 },
    qty: { type: Number, default: 1 },
    discount: { type: Number, default: 0 },
    tax: { type: Number, default: 18 },
    measurements: { type: mongoose.Schema.Types.Mixed },
    dynamicData: { type: mongoose.Schema.Types.Mixed }
  }]
}, { timestamps: true });

export default mongoose.model('Order', OrderSchema);
