const mongoose = require('mongoose');

async function run() {
  await mongoose.connect('mongodb://localhost:27017/aran_erp');
  const collections = await mongoose.connection.db.listCollections().toArray();
  const collectionNames = collections.map(c => c.name);
  console.log('Collections:', collectionNames);
  process.exit(0);
}

run();
