import mongoose from 'mongoose';

const EnquirySchema = new mongoose.Schema({
  customerName: { type: String, required: true },
  mobileNumber: { type: String },
  details: { type: String, required: true },
  value: { type: Number, default: 0 },
  status: { type: String, enum: ['New', 'In Progress', 'Closed Won', 'Closed Lost'], default: 'New' },
  source: { type: String, default: 'Website' }
}, { timestamps: true });

export default mongoose.model('Enquiry', EnquirySchema);
