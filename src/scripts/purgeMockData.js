import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/aran_erp';

async function purgeMockData() {
  try {
    console.log(`Connecting to MongoDB at: ${MONGODB_URI}`);
    await mongoose.connect(MONGODB_URI);
    console.log('Connected successfully.');

    const db = mongoose.connection.db;

    // 1. Purge seeded mock payments
    const mockPaymentNumbers = [
      '35612', '35613', '35614', '35616', '35617', '35618', '35619', '35620', '35621'
    ];
    const paymentsCol = db.collection('payments');
    const paymentDeleteRes = await paymentsCol.deleteMany({
      $or: [
        { paymentNumber: { $in: mockPaymentNumbers } },
        { receiptNumber: { $in: mockPaymentNumbers } }
      ]
    });
    console.log(`Purged ${paymentDeleteRes.deletedCount} mock payments.`);

    // 2. Purge seeded mock accounts
    const accountsCol = db.collection('accounts');
    const accountDeleteRes = await accountsCol.deleteMany({
      $or: [
        { name: 'Cash in hand', openingBalance: 28382272 },
        { name: 'Unlinked Transactions', openingBalance: 1625363 },
        { name: 'Senthamari Selvi', accountNumber: '50100458923412' },
        { name: 'Sangeeth Anna Gpay', upiId: 'sangeeth@okaxis' },
        { name: 'Raj', openingBalance: 6625758 }
      ]
    });
    console.log(`Purged ${accountDeleteRes.deletedCount} mock bank accounts.`);

    // 3. Purge orphaned account transactions
    const txCol = db.collection('accounttransactions');
    const txDeleteRes = await txCol.deleteMany({
      $or: [
        { paymentNumber: { $in: mockPaymentNumbers } },
        { referencePaymentId: { $in: mockPaymentNumbers } }
      ]
    });
    console.log(`Purged ${txDeleteRes.deletedCount} mock account transactions.`);

    // 4. Purge seeded mock audit logs
    const auditCol = db.collection('auditlogs');
    const auditDeleteRes = await auditCol.deleteMany({
      $or: [
        { action: 'Login', module: 'Auth', user: 'admin', details: 'Successful administrator login' },
        { action: 'Template Created', module: 'Configuration', user: 'admin', details: 'Seeded system twin template' },
        { action: 'Database Seeded', module: 'System', user: 'admin', details: 'Initial database rule engine structures seeded' }
      ]
    });
    console.log(`Purged ${auditDeleteRes.deletedCount} mock audit logs.`);

    // Check remaining counts
    const remainingPayments = await paymentsCol.countDocuments();
    const remainingAccounts = await accountsCol.countDocuments();
    const remainingAuditLogs = await auditCol.countDocuments();

    console.log('\n--- Status After Cleanup ---');
    console.log(`Remaining Payments: ${remainingPayments}`);
    console.log(`Remaining Accounts: ${remainingAccounts}`);
    console.log(`Remaining Audit Logs: ${remainingAuditLogs}`);

    await mongoose.disconnect();
    console.log('Finished purge successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Error purging mock data:', error);
    process.exit(1);
  }
}

purgeMockData();
