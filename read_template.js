import mongoose from 'mongoose';
import fs from 'fs';

async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/aran_erp');
  const Template = mongoose.connection.collection('templates');
  const t = await Template.findOne({ name: 'FixedBreezeProduction' });
  if (t) {
    fs.writeFileSync('db_react_code.jsx', t.reactCode);
    console.log("React code written to backend/db_react_code.jsx");
  } else {
    console.log("Template not found");
  }
  await mongoose.disconnect();
}

run();
