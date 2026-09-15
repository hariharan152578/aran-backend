import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Template from './src/modules/configuration/models/Template.js';
import TemplateMeasurement from './src/modules/configuration/models/TemplateMeasurement.js';
import TemplateFormula from './src/modules/configuration/models/TemplateFormula.js';
import TemplateBOM from './src/modules/configuration/models/TemplateBOM.js';

dotenv.config();
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/aran-erp');

async function fetchResponses() {
  const templateId = '6a1ea9510eb86e3fb7a03cd0';
  
  const template = await Template.findById(templateId);
  console.log('--- Template ---');
  console.log(template ? template.name : 'Not Found');
  
  const measurements = await TemplateMeasurement.find({ templateId });
  console.log('\n--- Measurements ---');
  measurements.forEach(m => console.log(m.fieldName));
  
  const formulas = await TemplateFormula.find({ templateId });
  console.log('\n--- Formulas ---');
  formulas.forEach(f => {
    if (f.name.includes('Fix') || f.name.includes('Bead') || f.name.includes('Width') || f.name.includes('Height')) {
       console.log(`${f.name} = ${f.formula}`);
    }
  });

  const bom = await TemplateBOM.find({ templateId });
  console.log('\n--- BOM ---');
  bom.forEach(b => {
    if (b.materialName.includes('Fix') || b.materialName.includes('Bead')) {
       console.log(b.materialName);
    }
  });
  
  process.exit(0);
}

fetchResponses().catch(console.error);
