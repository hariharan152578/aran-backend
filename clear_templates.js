import mongoose from 'mongoose';
import Template from './src/modules/configuration/models/Template.js';
import TemplateMeasurement from './src/modules/configuration/models/TemplateMeasurement.js';
import TemplateFeature from './src/modules/configuration/models/TemplateFeature.js';
import TemplateFormula from './src/modules/configuration/models/TemplateFormula.js';
import TemplateBom from './src/modules/configuration/models/TemplateBom.js';
import TemplateHardware from './src/modules/configuration/models/TemplateHardware.js';
import TemplatePricing from './src/modules/configuration/models/TemplatePricing.js';
import TemplateVersion from './src/modules/configuration/models/TemplateVersion.js';

async function clearDb() {
  await mongoose.connect('mongodb://localhost:27017/aran_erp');
  console.log('Connected to DB');

  const resTemplate = await Template.deleteMany({});
  const resMeasurement = await TemplateMeasurement.deleteMany({});
  const resFeature = await TemplateFeature.deleteMany({});
  const resFormula = await TemplateFormula.deleteMany({});
  const resBom = await TemplateBom.deleteMany({});
  const resHardware = await TemplateHardware.deleteMany({});
  const resPricing = await TemplatePricing.deleteMany({});
  const resVersion = await TemplateVersion.deleteMany({});

  console.log('Cleared database:');
  console.log(`- Deleted ${resTemplate.deletedCount} Templates`);
  console.log(`- Deleted ${resMeasurement.deletedCount} TemplateMeasurements`);
  console.log(`- Deleted ${resFeature.deletedCount} TemplateFeatures`);
  console.log(`- Deleted ${resFormula.deletedCount} TemplateFormulas`);
  console.log(`- Deleted ${resBom.deletedCount} TemplateBoms`);
  console.log(`- Deleted ${resHardware.deletedCount} TemplateHardwares`);
  console.log(`- Deleted ${resPricing.deletedCount} TemplatePricings`);
  console.log(`- Deleted ${resVersion.deletedCount} TemplateVersions`);

  await mongoose.disconnect();
}

clearDb().catch(console.error);
