import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DatabaseService from '../modules/admin/databaseService.js';

dotenv.config();

async function runTests() {
  console.log('--- Starting Database Administration Operations Test ---');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('1. Connected to MongoDB successfully');

  // Test 1: Collections listing and classification
  const stats = await DatabaseService.getCollectionsStats();
  console.log(`2. Total collections discovered: ${stats.totalCollections}, total records: ${stats.totalRecords}`);
  if (stats.collections.length === 0) throw new Error('No collections returned');
  const sampleCol = stats.collections.find((c) => c.count > 0) || stats.collections[0];
  console.log(`   Sample collection: ${sampleCol.name} (${sampleCol.displayName}) - ${sampleCol.count} records [${sampleCol.severity}]`);

  // Test 2: Documents pagination
  const docsResult = await DatabaseService.getCollectionDocuments(sampleCol.name, { page: 1, limit: 5 });
  console.log(`3. Fetched documents for ${sampleCol.name}: got ${docsResult.documents.length} docs (total: ${docsResult.total})`);

  // Test 3: Insert Document into a safe test collection (auditlogs or test collection)
  const testDoc = {
    testField: 'Automated Test Record',
    numberField: 42,
    createdAt: new Date().toISOString()
  };
  const inserted = await DatabaseService.insertDocument('auditlogs', testDoc, 'system_test');
  console.log(`4. Inserted test document into 'auditlogs': ID = ${inserted._id}`);

  // Test 4: Update Document (Edit)
  const updated = await DatabaseService.updateDocument(
    'auditlogs',
    inserted._id.toString(),
    { testField: 'Automated Test Record (EDITED)', numberField: 99 },
    'system_test'
  );
  console.log(`5. Updated test document: new testField = "${updated.testField}", numberField = ${updated.numberField}`);

  // Test 5: Export collection as CSV & JSON
  const jsonExport = await DatabaseService.exportCollection('auditlogs', 'json');
  console.log(`6. Exported JSON length: ${jsonExport.content.length} chars, filename: ${jsonExport.filename}`);

  const csvExport = await DatabaseService.exportCollection('auditlogs', 'csv');
  console.log(`7. Exported CSV length: ${csvExport.content.length} chars, filename: ${csvExport.filename}`);

  // Test 6: Delete Document
  const deleteRes = await DatabaseService.deleteDocument('auditlogs', inserted._id.toString(), 'system_test');
  console.log(`8. Deleted test document: ${deleteRes.deletedId}`);

  // Test 7: Create server backup
  const backup = await DatabaseService.saveServerBackup('system_test', 'test_backup');
  console.log(`9. Created server backup: ${backup.filename} (${backup.formattedSize})`);

  // Test 8: List backups
  const backupsList = await DatabaseService.listServerBackups();
  console.log(`10. Backups listed: found ${backupsList.length} files`);
  const foundOurBackup = backupsList.find((b) => b.filename === backup.filename);
  if (!foundOurBackup) throw new Error('Newly created backup not found in list');

  // Test 9: Clean up test backup file
  await DatabaseService.deleteServerBackup(backup.filename, 'system_test');
  console.log(`11. Cleaned up test backup file: ${backup.filename}`);

  console.log('--- ALL DATABASE OPERATIONS TESTS PASSED SUCCESSFULLY! ---');
  await mongoose.disconnect();
  process.exit(0);
}

runTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
