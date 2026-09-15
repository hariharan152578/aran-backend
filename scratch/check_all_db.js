import mongoose from 'mongoose';
import Customer from '../src/modules/crm/models/Customer.js';
import Order from '../src/modules/sales/models/Order.js';

async function test() {
  await mongoose.connect('mongodb://localhost:27017/aran_erp');
  console.log('Connected to MongoDB');

  // Let's check Customers
  const customers = await Customer.find({});
  console.log('\n--- Customers ---');
  for (const c of customers) {
    console.log(`Name: ${c.name}, ID: ${c._id}`);
    console.log(`  Opening Balance: ${c.openingBalance}, Balance Type: ${c.balanceType}`);
  }

  // Let's check Invoices & Payments if they exist
  const InvoiceSchema = new mongoose.Schema({}, { strict: false });
  const Invoice = mongoose.models.Invoice || mongoose.model('Invoice', InvoiceSchema);
  const PaymentSchema = new mongoose.Schema({}, { strict: false });
  const Payment = mongoose.models.Payment || mongoose.model('Payment', PaymentSchema);

  const invoices = await Invoice.find({});
  console.log('\n--- Invoices ---');
  for (const inv of invoices) {
    console.log(`Invoice Number: ${inv.get('invoiceNumber') || inv.get('id')}, Customer: ${inv.get('customerName')}, Amount: ${inv.get('amount')}, Status: ${inv.get('status')}, Mongoose ID: ${inv._id}`);
  }

  const payments = await Payment.find({});
  console.log('\n--- Payments ---');
  for (const p of payments) {
    console.log(`Receipt Number: ${p.get('receiptNumber')}, Customer: ${p.get('customerName') || p.get('party')}, Amount Paid: ${p.get('amountPaid')}, Mongoose ID: ${p._id}`);
  }

  await mongoose.disconnect();
}

test().catch(console.error);
