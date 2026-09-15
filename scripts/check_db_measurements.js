import mongoose from 'mongoose';

mongoose.connect('mongodb://127.0.0.1:27017/aran_erp').then(async () => {
  const Template = mongoose.model('Template', new mongoose.Schema({}, {strict:false}));
  const TemplateMeasurement = mongoose.model('TemplateMeasurement', new mongoose.Schema({}, {strict:false}));
  
  const templates = await Template.find({}, 'name code description');
  console.log('--- TEMPLATES ---');
  console.log(JSON.stringify(templates, null, 2));

  for (const t of templates) {
    const measurements = await TemplateMeasurement.find({ templateId: t._id });
    console.log(`\n--- Measurements for template: ${t.name} (${t.code}) ---`);
    console.log(JSON.stringify(measurements, null, 2));
  }

  process.exit(0);
});
