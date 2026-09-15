import mongoose from 'mongoose';
import Order from '../src/modules/sales/models/Order.js';

async function test() {
  await mongoose.connect('mongodb://localhost:27017/aran_erp');
  console.log('Connected to MongoDB');

  const orders = await Order.find({});
  for (const o of orders) {
    console.log(`Order ID: ${o._id}`);
    console.log(`  id/orderNumber: ${o.id || o.orderNumber}`);
    console.log(`  quotationId: ${o.quotationId}`);
    console.log(`  quotationRef: ${o.quotationRef}`);
  }

  await mongoose.disconnect();
}

test().catch(console.error);
