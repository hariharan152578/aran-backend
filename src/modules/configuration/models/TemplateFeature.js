import mongoose from 'mongoose';

const TemplateFeatureSchema = new mongoose.Schema({
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template', required: true },
  featureId: { type: mongoose.Schema.Types.ObjectId, required: true } // Reference to a global feature collection or store name inline
});

export default mongoose.model('TemplateFeature', TemplateFeatureSchema);
