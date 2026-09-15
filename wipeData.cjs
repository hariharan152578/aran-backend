const mongoose = require('mongoose');

async function run() {
  await mongoose.connect('mongodb://localhost:27017/aran_erp');
  const collections = await mongoose.connection.db.listCollections().toArray();
  const collectionNames = collections.map(c => c.name);
  
  const toWipe = [
    'dispatchorders', 'payments', 'enquiries', 'followups', 
    'installationorders', 'warrantycards', 'amcs', 'complaints'
  ];

  for (const name of collectionNames) {
    if (toWipe.includes(name)) {
      console.log(`Wiping collection: ${name}`);
      await mongoose.connection.db.collection(name).deleteMany({});
      console.log(`Cleared ${name}`);
    }
  }

  console.log('Done.');
  process.exit(0);
}

run();
