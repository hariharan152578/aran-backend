import mongoose from 'mongoose';

const CourierSchema = new mongoose.Schema({
  courierName: { type: String, required: true }, // e.g. Blue Dart, DTDC, FedEx, Porter
  trackingNo: { type: String }, // AWB / Account / Tracking reference number
  contactPerson: { type: String, required: true },
  contactMobile: { type: String, required: true },
  serviceType: { type: String, default: 'Standard Express' }, // e.g. Express Air, Surface Cargo, Hyperlocal 2-Wheeler, Heavy Freight
  branchLocation: { type: String }, // e.g. Bangalore South Hub
  status: { type: String, enum: ['Active', 'On Delivery', 'Inactive'], default: 'Active' },
  notes: { type: String }
}, { timestamps: true });

export default mongoose.model('Courier', CourierSchema);
