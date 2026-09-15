import mongoose from 'mongoose';
import Quotation from '../src/modules/sales/models/Quotation.js';

async function test() {
  await mongoose.connect('mongodb://localhost:27017/aran_erp');
  console.log('Connected to MongoDB');
  
  const quotes = await Quotation.find({});
  console.log(`Quotations found: ${quotes.length}`);
  for (const q of quotes) {
    console.log(`Quote Number: ${q.quotationNumber}, Mongoose ID: ${q._id}`);
    console.log(`  TotalAmount: ${q.totalAmount}`);
    console.log(`  LineItems length: ${q.lineItems?.length}`);
    let sum = 0;
    if (q.lineItems) {
      q.lineItems.forEach((li, idx) => {
        const itemQty = li.measurements?.totalSqFt || li.qty || 1;
        const itemRate = li.price || li.rate || 0;
        const itemAmt = itemQty * itemRate;
        sum += itemAmt;
        console.log(`    Item ${idx + 1}: ${li.templateName || li.name}, qty: ${itemQty}, rate: ${itemRate}, amt: ${itemAmt}`);
      });
    }
    console.log(`  Sum of line item amounts: ${sum}`);
  }
  
  await mongoose.disconnect();
}

test().catch(console.error);
