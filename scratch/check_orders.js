import mongoose from 'mongoose';
import Order from '../src/modules/sales/models/Order.js';

async function test() {
  await mongoose.connect('mongodb://localhost:27017/aran_erp');
  console.log('Connected to MongoDB');
  
  const orders = await Order.find({});
  console.log(`Orders found: ${orders.length}`);
  for (const o of orders) {
    console.log(`Order ID: ${o.id}, Mongoose ID: ${o._id}`);
    console.log(`  Amount: ${o.amount}`);
    console.log(`  TotalAmount: ${o.totalAmount}`);
    console.log(`  AmountPaid: ${o.amountPaid}`);
    console.log(`  LineItems length: ${o.lineItems?.length}`);
    if (o.lineItems) {
      o.lineItems.forEach((li, idx) => {
        console.log(`    Item ${idx + 1}: ${li.name || li.templateName}, qty: ${li.qty}, price: ${li.price}, totalSqFt: ${li.measurements?.totalSqFt}`);
      });
    }
  }
  
  await mongoose.disconnect();
}

test().catch(console.error);
