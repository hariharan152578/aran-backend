import mongoose from 'mongoose';

async function test() {
  await mongoose.connect('mongodb://localhost:27017/aran_erp');
  console.log('Connected to MongoDB');

  const PaymentSchema = new mongoose.Schema({}, { strict: false });
  const Payment = mongoose.models.Payment || mongoose.model('Payment', PaymentSchema);

  const payments = await Payment.find({});
  for (const p of payments) {
    console.log(`Payment ID: ${p._id}`);
    console.log(`  receiptNumber: ${p.get('receiptNumber')}`);
    console.log(`  amountPaid: ${p.get('amountPaid')}`);
    console.log(`  invoiceId: ${p.get('invoiceId')} (${typeof p.get('invoiceId')})`);
  }

  await mongoose.disconnect();
}

test().catch(console.error);
