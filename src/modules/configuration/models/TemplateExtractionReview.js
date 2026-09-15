import mongoose from 'mongoose';

const reviewMappingSchema = new mongoose.Schema({
  fieldName: { type: String, required: true },
  mappedField: { type: String },
  originalValue: { type: String }, // Raw Excel header or value
  type: { type: String, enum: ['MEASUREMENT', 'RULE', 'BOM_LINK', 'HARDWARE_LINK'], required: true },
  confidence: { type: Number, required: true, min: 0, max: 100 },
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED', 'MODIFIED'], default: 'PENDING' }
});

const templateExtractionReviewSchema = new mongoose.Schema({
  scanId: { type: String, required: true },
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template' },
  mappings: [reviewMappingSchema],
  overallConfidence: { type: Number, required: true, min: 0, max: 100 },
  formulaConfidence: { type: Number, min: 0, max: 100 },
  hardwareConfidence: { type: Number, min: 0, max: 100 },
  bomConfidence: { type: Number, min: 0, max: 100 },
  materialConfidence: { type: Number, min: 0, max: 100 },
  reviewStatus: { type: String, enum: ['REQUIRES_REVIEW', 'COMPLETED'], default: 'REQUIRES_REVIEW' },
  rawExtractionData: { type: Object, required: true },
  metadata: {
     originalFileName: { type: String },
     categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
     subcategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
     seriesId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' }
  }
}, { timestamps: true });

export default mongoose.model('TemplateExtractionReview', templateExtractionReviewSchema);
