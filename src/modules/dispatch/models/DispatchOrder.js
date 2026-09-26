import mongoose from 'mongoose';

const DispatchOrderSchema = new mongoose.Schema({
  dispatchNumber: { type: String, required: true, unique: true },
  orderId: { type: mongoose.Schema.Types.Mixed, required: true },
  customerName: { type: String, required: true },
  deliveryAddress: { type: String, required: true },
  dispatchMode: { type: String, enum: ['Truck', 'Courier'], default: 'Truck' },
  vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
  courierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Courier' },
  courierName: { type: String },
  trackingNo: { type: String },
  batchId: { type: mongoose.Schema.Types.Mixed },
  batchNumber: { type: String },
  templateName: { type: String },
  qty: { type: Number },
  status: { type: String, enum: ['Not Reached', 'Reached', 'Processing', 'Ready', 'Ready for Dispatch', 'Dispatched', 'In Transit', 'Delivered'], default: 'Ready' }
}, { timestamps: true });

export default mongoose.model('DispatchOrder', DispatchOrderSchema);
