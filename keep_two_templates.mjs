import mongoose from 'mongoose';
import Template from './src/modules/configuration/models/Template.js';
import TemplateMeasurement from './src/modules/configuration/models/TemplateMeasurement.js';
import TemplateFeature from './src/modules/configuration/models/TemplateFeature.js';
import TemplateFormula from './src/modules/configuration/models/TemplateFormula.js';
import TemplateBom from './src/modules/configuration/models/TemplateBom.js';
import TemplateHardware from './src/modules/configuration/models/TemplateHardware.js';
import TemplatePricing from './src/modules/configuration/models/TemplatePricing.js';
import TemplateVersion from './src/modules/configuration/models/TemplateVersion.js';

const KEEP_NAMES = ['test', 'test2'];

async function run() {
  await mongoose.connect('mongodb://localhost:27017/aran_erp');
  console.log('Connected to MongoDB: aran_erp');

  // Find the IDs of the two templates to KEEP
  const keepTemplates = await Template.find({
    name: { $in: KEEP_NAMES }
  }).select('_id name templateCode');

  console.log('\nTemplates to KEEP:');
  keepTemplates.forEach(t => console.log(`  ✓ ${t.name} (${t._id})`));

  if (keepTemplates.length === 0) {
    console.warn('\n⚠ No templates matching keep names found. Aborting to avoid wiping everything.');
    await mongoose.disconnect();
    process.exit(1);
  }

  const keepIds = keepTemplates.map(t => t._id);

  // Find all templates that will be deleted
  const toDelete = await Template.find({ _id: { $nin: keepIds } }).select('_id name');
  console.log(`\nTemplates to DELETE (${toDelete.length} total):`);
  toDelete.forEach(t => console.log(`  ✗ ${t.name} (${t._id})`));
  const deleteIds = toDelete.map(t => t._id);

  if (deleteIds.length === 0) {
    console.log('\nNothing to delete. Done.');
    await mongoose.disconnect();
    return;
  }

  // Delete all related records for those templates
  const r1 = await Template.deleteMany({ _id: { $in: deleteIds } });
  const r2 = await TemplateMeasurement.deleteMany({ templateId: { $in: deleteIds } });
  const r3 = await TemplateFeature.deleteMany({ templateId: { $in: deleteIds } });
  const r4 = await TemplateFormula.deleteMany({ templateId: { $in: deleteIds } });
  const r5 = await TemplateBom.deleteMany({ templateId: { $in: deleteIds } });
  const r6 = await TemplateHardware.deleteMany({ templateId: { $in: deleteIds } });
  const r7 = await TemplatePricing.deleteMany({ templateId: { $in: deleteIds } });
  const r8 = await TemplateVersion.deleteMany({ templateId: { $in: deleteIds } });

  console.log('\n✅ Cleanup complete:');
  console.log(`  Deleted ${r1.deletedCount} Templates`);
  console.log(`  Deleted ${r2.deletedCount} TemplateMeasurements`);
  console.log(`  Deleted ${r3.deletedCount} TemplateFeatures`);
  console.log(`  Deleted ${r4.deletedCount} TemplateFormulas`);
  console.log(`  Deleted ${r5.deletedCount} TemplateBoms`);
  console.log(`  Deleted ${r6.deletedCount} TemplateHardwares`);
  console.log(`  Deleted ${r7.deletedCount} TemplatePricings`);
  console.log(`  Deleted ${r8.deletedCount} TemplateVersions`);

  // Confirm what remains
  const remaining = await Template.find({}).select('_id name templateCode');
  console.log(`\n📋 Remaining templates (${remaining.length}):`);
  remaining.forEach(t => console.log(`  • ${t.name} [${t.templateCode || 'no code'}] (${t._id})`));

  await mongoose.disconnect();
  console.log('\nDisconnected. Done.');
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
