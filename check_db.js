import mongoose from 'mongoose';
import Template from './src/modules/configuration/models/Template.js';
import TemplateMeasurement from './src/modules/configuration/models/TemplateMeasurement.js';
import TemplateFormula from './src/modules/configuration/models/TemplateFormula.js';

async function test() {
  await mongoose.connect('mongodb://localhost:27017/aran_erp');
  console.log('Connected');
  
  const templates = await Template.find({});
  console.log('Templates found:', templates.length);
  for (const t of templates) {
    console.log(`- ID: ${t._id}, Code: ${t.code}, Name: ${t.name}`);
    const ms = await TemplateMeasurement.find({ templateId: t._id });
    const forms = await TemplateFormula.find({ templateId: t._id });
    console.log(`  Measurements: ${ms.length}, Formulas: ${forms.length}`);
  }
  
  await mongoose.disconnect();
}

test().catch(console.error);
