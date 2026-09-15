import mongoose from 'mongoose';

const formulaSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Formula name is required'],
    unique: true,
    trim: true
  },
  type: {
    type: String,
    required: [true, 'Formula type is required'],
    enum: {
      values: ['Profile', 'Steel', 'Glass', 'Rubber', 'Hardware', 'Labor', 'Pricing'],
      message: '{VALUE} is not a valid formula type'
    }
  },
  expression: {
    type: String,
    required: [true, 'Expression string is required'],
    trim: true
  },
  variables: {
    type: [String],
    default: ['width', 'height']
  },
  unit: {
    type: String,
    required: [true, 'Output unit is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

const Formula = mongoose.model('Formula', formulaSchema);

export default Formula;
