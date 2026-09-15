const fs = require('fs');
const mongoose = require('mongoose');

mongoose.connect('mongodb://127.0.0.1:27017/aran_erp').then(async () => {
  const Template = mongoose.connection.collection('templates');
  const reactCode = fs.readFileSync('d:/test/aran/backend/louver_template.jsx', 'utf8');
  await Template.updateOne({ name: 'LouverBreezeProduction' }, { $set: { reactCode } });
  console.log('Saved LouverBreezeProduction back to DB');
  mongoose.disconnect();
});
