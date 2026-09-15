import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { translateFormulas } from './src/modules/configuration/services/FormulaTranslationService.js';
import { classifyNodes } from './src/modules/configuration/services/BusinessClassificationService.js';
import { recognizeStructures } from './src/modules/configuration/services/StructureRecognitionService.js';
import GraphNode from './src/modules/configuration/models/GraphNode.js';
import Template from './src/modules/configuration/models/Template.js';

dotenv.config();

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('Connected to DB');
    // Using the scanId from the template
    const templateId = '6a1ea9510eb86e3fb7a03cd0';
    // Let's find any node for this template to get its scanId
    // Find a scanId to use
    const GraphNode = (await import('./src/modules/configuration/models/GraphNode.js')).default;
    const sampleNode = await GraphNode.findOne({ alias: /Derived/ });
    if (!sampleNode) {
       console.log('No nodes found');
       process.exit(0);
    }
    const scanId = sampleNode.scanId;
    console.log(`Testing with scanId: ${scanId}`);

    // We must run classification first because we added unique aliases logic
    const { recognizeStructures } = await import('./src/modules/configuration/services/StructureRecognitionService.js');
    const structures = await recognizeStructures(scanId);
    console.log('Schedules found:');
    for (const s of structures.schedules) {
       console.log(`Sheet: ${s.sheet}, Header Row: ${s.headerRow}`);
       console.log(`Columns: ${s.columns.map(c => c.header).join(', ')}`);
    }
    process.exit(0);
    
    // Now translate
    const translations = await translateFormulas(scanId);
    console.log(`Found ${translations.length} translations`);
    
    console.log('\n--- TRANSLATIONS ---');
    translations.forEach(t => console.log(`${t.alias} = ${t.translatedFormula}`));
    
    process.exit(0);
  })
  .catch(console.error);
