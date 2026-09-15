import mongoose from 'mongoose';

async function test() {
  await mongoose.connect('mongodb://localhost:27017/aran_erp');
  console.log('Connected to MongoDB');

  const InvoiceSchema = new mongoose.Schema({}, { strict: false });
  const Invoice = mongoose.models.Invoice || mongoose.model('Invoice', InvoiceSchema);

  const invoices = await Invoice.find({});
  for (const inv of invoices) {
    console.log(`Invoice ID: ${inv._id}`);
    console.log(`  invoiceNumber: ${inv.get('invoiceNumber')}`);
    console.log(`  orderId: ${inv.get('orderId')} (${typeof inv.get('orderId')})`);
    console.log(`  orderRef: ${inv.get('orderRef')} (${typeof inv.get('orderRef')})`);
    console.log(`  quotationId: ${inv.get('quotationId')} (${typeof inv.get('quotationId')})`);
  }

  await mongoose.disconnect();
}

test().catch(console.error);
