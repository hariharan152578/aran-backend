import mongoose from 'mongoose';

const QuotationCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  termsAndConditions: { type: String, default: '' },
  hasGlass: { type: Boolean, default: false },
  customColumns: [{
    name: { type: String, required: true },
    type: { type: String, enum: ['text', 'dropdown', 'glass'], default: 'text' },
    options: [{ type: String }],
    isGlass: { type: Boolean, default: false }
  }]
}, { timestamps: true });

export default mongoose.model('QuotationCategory', QuotationCategorySchema);
