import mongoose from 'mongoose';

async function test() {
  await mongoose.connect('mongodb://localhost:27017/aran_erp');
  console.log('Connected to MongoDB');

  const InvoiceSchema = new mongoose.Schema({}, { strict: false });
  const Invoice = mongoose.models.Invoice || mongoose.model('Invoice', InvoiceSchema);
  const PaymentSchema = new mongoose.Schema({}, { strict: false });
  const Payment = mongoose.models.Payment || mongoose.model('Payment', PaymentSchema);

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
