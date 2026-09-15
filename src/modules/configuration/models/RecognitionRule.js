import mongoose from 'mongoose';

const recognitionRuleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  aliases: [{
    type: String,
    trim: true
  }],
  category: {
    type: String,
    enum: ['METADATA', 'SCHEDULE', 'BOM', 'HARDWARE', 'NOISE'],
    required: true
  },
  fieldType: {
    type: String,
    enum: ['STRING', 'NUMBER', 'BOOLEAN', 'FORMULA', 'UNKNOWN'],
    default: 'UNKNOWN'
  }
}, { timestamps: true });

export default mongoose.model('RecognitionRule', recognitionRuleSchema);
