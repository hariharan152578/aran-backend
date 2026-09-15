import mongoose from 'mongoose';

const QuotationCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  termsAndConditions: { type: String, default: '' },
  customColumns: [{
    name: { type: String, required: true },
    type: { type: String, enum: ['text', 'dropdown'], default: 'text' },
    options: [{ type: String }]
  }]
}, { timestamps: true });

export default mongoose.model('QuotationCategory', QuotationCategorySchema);
