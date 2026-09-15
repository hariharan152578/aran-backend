import mongoose from 'mongoose';
import Payment from '../src/modules/accounts/models/Payment.js';
import Invoice from '../src/modules/accounts/models/Invoice.js';

async function test() {
  await mongoose.connect('mongodb://localhost:27017/aran_erp');
  console.log('Connected to MongoDB');

  const invoices = await Invoice.find({});
  const payments = await Payment.find({}).populate('invoiceId');

  const invoice = invoices[0];
  const invIdStr = String(invoice._id);

  console.log(`Invoice _id: ${invIdStr}`);

  const filteredPayments = payments.filter(p => {
    const rawInv = p.get('invoiceId');
    const pInvId = (rawInv && typeof rawInv === 'object') ? rawInv._id : rawInv;
    console.log(`Comparing payment ${p.get('receiptNumber')}: pInvId = ${pInvId} (${typeof pInvId}) vs invIdStr = ${invIdStr}`);
    return String(pInvId) === invIdStr;
  });

  console.log(`Filtered payments length: ${filteredPayments.length}`);
  
  await mongoose.disconnect();
}

test().catch(console.error);
