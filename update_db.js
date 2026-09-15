import fs from 'fs';
import mongoose from 'mongoose';
mongoose.connect('mongodb://127.0.0.1:27017/aran_erp').then(async () => {
  const code = fs.readFileSync('temp_code_v3.jsx', 'utf-8');
  await mongoose.model('Template', new mongoose.Schema({}, {strict:false})).updateOne({name: 'FixedBreezeProduction'}, { $set: { reactCode: code } });
  console.log('Updated successfully');
  process.exit();
});
