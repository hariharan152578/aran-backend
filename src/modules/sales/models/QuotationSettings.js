import mongoose from 'mongoose';

const QuotationSettingsSchema = new mongoose.Schema({
  key: { type: String, default: 'default_accessories', unique: true },
  packingForwarding: {
    qty: { type: Number, default: 0 },
    rate: { type: Number, default: 0 },
    amount: { type: Number, default: 0 }
  },
  erectionScrew: {
    qty: { type: Number, default: 0 },
    rate: { type: Number, default: 0 },
    amount: { type: Number, default: 0 }
  },
  foam: {
    qty: { type: Number, default: 0 },
    rate: { type: Number, default: 0 },
    amount: { type: Number, default: 0 }
  },
  silicon: {
    qty: { type: Number, default: 0 },
    rate: { type: Number, default: 0 },
    amount: { type: Number, default: 0 }
  },
  customAccessories: [{
    id: { type: String },
    name: { type: String },
    type: { type: String, default: 'rate' },
    qty: { type: Number, default: 0 },
    rate: { type: Number, default: 0 },
    amount: { type: Number, default: 0 }
  }]
}, { timestamps: true });

export default mongoose.model('QuotationSettings', QuotationSettingsSchema);
