import mongoose from 'mongoose';

const OrderSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true }, // e.g. "Set 1 - A001" or "A001"
  orderNumber: { type: String }, // e.g. "A001"
  setNumber: { type: Number, default: 1, index: true }, // e.g. 1
  setLabel: { type: String, default: 'Set 1' }, // e.g. "Set 1"
  series: { type: String, default: 'A', index: true }, // e.g. "A" (A-Z)
  sequenceNumber: { type: Number, default: 1, index: true }, // e.g. 1 (1-999)
  quotationRef: { type: String },
  quotationDate: { type: Date },
  productionCardNo: { type: String },
  employee: { type: String, default: '' },
  followedBy: { type: String, default: '' },
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
  status: { 
    type: String, 
    enum: ['Processing', 'In Production', 'Verification Pending', 'Proceed for Production', 'Start', 'Completed', 'Dispatched', 'Cancelled', 'Created'], 
    default: 'Processing' 
  },
  lineItems: [{
    templateId: { type: String },
    templateCode: { type: String },
    templateName: { type: String },
    name: { type: String }, // Used as fallback in frontend
    price: { type: Number, default: 0 },
    qty: { type: Number, default: 1 },
    discount: { type: Number, default: 0 },
    tax: { type: Number, default: 18 },
    amount: { type: Number, default: 0 },
    measurements: { type: mongoose.Schema.Types.Mixed },
    dynamicData: { type: mongoose.Schema.Types.Mixed }
  }],
  extraCharges: { type: mongoose.Schema.Types.Mixed },
  additionalCharges: [{ label: { type: String }, amount: { type: Number } }],
  discounts: [{ label: { type: String }, amount: { type: Number } }],
  subtotal: { type: Number, default: 0 },
  totalSqFt: { type: Number, default: 0 },
  totalQty: { type: Number, default: 0 },
  taxRate: { type: Number, default: 18 },
  taxAmount: { type: Number, default: 0 },
  roundOff: { type: Number, default: 0 }
}, { timestamps: true });

export default mongoose.model('Order', OrderSchema);
