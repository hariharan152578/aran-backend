const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/aran_erp';
const codePath = path.resolve(__dirname, '../../frontend/Breeze templates/SLMBaydeeBreezeSashProduction.jsx');

async function main() {
  await mongoose.connect(MONGODB_URI);
  const code = fs.readFileSync(codePath, 'utf8');
  const templates = mongoose.connection.collection('templates');

  const result = await templates.updateMany(
    {
      $or: [
        { name: /baydee/i },
        { code: /036137/i },
        { code: /sl.*m/i }
      ],
      templateType: 'REACT_COMPONENT'
    },
    { $set: { reactCode: code, updatedAt: new Date() } }
  );

  console.log(`Matched ${result.matchedCount}, modified ${result.modifiedCount}`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
