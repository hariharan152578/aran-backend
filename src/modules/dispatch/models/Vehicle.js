import mongoose from 'mongoose';

const VehicleSchema = new mongoose.Schema({
  vehicleNumber: { type: String, required: true, unique: true },
  type: { type: String, required: true }, // e.g. TATA Ace, Mahindra Pickup
  driverName: { type: String, required: true },
  driverMobile: { type: String },
  status: { type: String, enum: ['Available', 'On Delivery', 'Maintenance'], default: 'Available' }
}, { timestamps: true });

export default mongoose.model('Vehicle', VehicleSchema);
