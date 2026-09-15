import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/aran_erp');
  console.log("Connected to MongoDB.");

  const Template = mongoose.connection.collection('templates');

  // Update FixedBreezeProduction
  const fixedCode = fs.readFileSync(path.resolve('fixed_template.jsx'), 'utf8');
  let result = await Template.updateOne(
    { name: 'FixedBreezeProduction' },
    { $set: { reactCode: fixedCode, status: 'PUBLISHED' } }
  );
  console.log(`Updated FixedBreezeProduction React template in DB. Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`);

  // Update LouverBreezeProduction
  if (fs.existsSync(path.resolve('louver_template.jsx'))) {
    const louverCode = fs.readFileSync(path.resolve('louver_template.jsx'), 'utf8');
    result = await Template.updateOne(
      { name: 'LouverBreezeProduction' },
      { $set: { reactCode: louverCode, status: 'PUBLISHED' } }
    );
    console.log(`Updated LouverBreezeProduction React template in DB. Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`);
  }

  await mongoose.disconnect();
}

run().catch(console.error);
