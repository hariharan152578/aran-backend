import mongoose from 'mongoose';

const QuotationSchema = new mongoose.Schema({
  quotationNumber: { type: String, required: true, unique: true }, // e.g. QT-2026-001
  date: { type: Date, default: Date.now },
  party: { type: mongoose.Schema.Types.Mixed }, // Customer details
  deliveryAddress: { type: String },
  status: { type: String, enum: ['Draft', 'Pending', 'Sent', 'Approved', 'Rejected', 'Converted'], default: 'Pending' },
  
  lineItems: [{
    templateId: { type: String }, // Can be string or ObjectId
    templateCode: { type: String },
    templateName: { type: String },
    price: { type: Number, default: 0 },
    qty: { type: Number, default: 1 },
    discount: { type: Number, default: 0 }, // percentage
    tax: { type: Number, default: 18 }, // percentage
    measurements: { type: mongoose.Schema.Types.Mixed }, // e.g. { Width: 1500, Height: 1200 }
    dynamicData: { type: mongoose.Schema.Types.Mixed }, // Stores simulation preview, bom, results
    customFields: { type: mongoose.Schema.Types.Mixed } // User inputs for dynamic category custom columns
  }],
  
  additionalCharges: [{
    label: { type: String },
    amount: { type: Number }
  }],
  
  discounts: [{
    label: { type: String },
    amount: { type: Number }
  }],
  
  autoRound: { type: Boolean, default: false },
  amountReceived: { type: Number, default: 0 },
  paymentMode: { type: String },
  notes: { type: String },
  
  totalAmount: { type: Number, default: 0 }, // final calculated total
  orderRef: { type: String }
}, { timestamps: true });

export default mongoose.model('Quotation', QuotationSchema);
