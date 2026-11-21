import mongoose from 'mongoose';

const MasterCardSettingsSchema = new mongoose.Schema({
  key: { type: String, default: 'global_master_card', unique: true },
  orientation: { type: String, enum: ['portrait', 'landscape'], default: 'portrait' },
  fontSize: { type: Number, default: 11 },
  fontFamily: { type: String, default: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  isBold: { type: Boolean, default: false },
  isItalic: { type: Boolean, default: false },
  scalePercent: { type: Number, default: 100 },
  cellPaddingMode: { type: String, enum: ['compact', 'comfortable', 'spacious'], default: 'comfortable' },
  tableWidthMode: { type: String, enum: ['100%', 'auto'], default: '100%' }
}, { timestamps: true });

export default mongoose.model('MasterCardSettings', MasterCardSettingsSchema);
