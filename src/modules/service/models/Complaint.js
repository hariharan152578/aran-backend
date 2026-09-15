import mongoose from 'mongoose';

const ComplaintSchema = new mongoose.Schema({
  complaintNumber: { type: String, required: true, unique: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  customerName: { type: String, required: true },
  details: { type: String, required: true },
  priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
  status: { type: String, enum: ['Open', 'In Progress', 'Resolved'], default: 'Open' }
}, { timestamps: true });

export default mongoose.model('Complaint', ComplaintSchema);
