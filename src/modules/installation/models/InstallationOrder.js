import mongoose from 'mongoose';

const InstallationOrderSchema = new mongoose.Schema({
  installationNumber: { type: String, required: true, unique: true },
  orderId: { type: mongoose.Schema.Types.Mixed, ref: 'Order', required: true },
  customerName: { type: String, required: true },
  address: { type: String, required: true },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallationTeam' },
  scheduledDate: { type: Date, required: true },
  status: { type: String, enum: ['Scheduled', 'In Progress', 'Completed'], default: 'Scheduled' }
}, { timestamps: true });

export default mongoose.model('InstallationOrder', InstallationOrderSchema);
