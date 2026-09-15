import fs from 'fs';
import mongoose from 'mongoose';
import path from 'path';

mongoose.connect('mongodb://127.0.0.1:27017/aran_erp').then(async () => {
  const Template = mongoose.model('Template', new mongoose.Schema({}, {strict:false}));
  const t = await Template.findOne({ name: 'FixedBreezeProduction' });
  if (!t) return console.log('Template not found');

  const newCode = fs.readFileSync(path.resolve('temp_code.jsx'), 'utf-8');
  t.set('reactCode', newCode);
  t.markModified('reactCode');

  await t.save();
  console.log('Template updated successfully with temp_code.jsx contents!');
  process.exit(0);
});
