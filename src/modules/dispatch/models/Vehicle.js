import mongoose from 'mongoose';

const VehicleSchema = new mongoose.Schema({
  vehicleNumber: { type: String, required: true, unique: true },
  driverMobile: { type: String, required: true },
  type: { type: String, default: 'Tempo' }, // e.g. TATA Ace, Mahindra Pickup
  driverName: { type: String, default: 'Fleet Driver' },
  status: { type: String, enum: ['Available', 'On Delivery', 'Maintenance'], default: 'Available' }
}, { timestamps: true });

export default mongoose.model('Vehicle', VehicleSchema);
