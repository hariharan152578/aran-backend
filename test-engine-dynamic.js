import connectDB from './src/config/db.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { processExcelToTemplate } from './src/modules/configuration/services/EnterpriseExtractionFacade.js';
import { generateTemplateFromRules } from './src/modules/configuration/services/TemplateGeneratorService.js';
import { runProductionEngine } from './src/modules/calculation-engine/evaluator.js';
import Template from './src/modules/configuration/models/Template.js';
import TemplateMeasurement from './src/modules/configuration/models/TemplateMeasurement.js';
import path from 'path';

dotenv.config();

async function run() {
  console.log('Connecting to database...');
  await connectDB();

  try {
    const benchmarkPath = path.resolve('./temp_uploads/1780394320031-OP-OP V.Cutting Breeze Production.xlsx');
    console.log(`\nImporting Excel file: ${benchmarkPath}`);
    
    // 1. Run Excel to Template Rules Facade
    const rules = await processExcelToTemplate(benchmarkPath, 'OP-OP V.Cutting Breeze Production.xlsx');
    console.log('Facade extraction complete.');
    console.log('Rules mapped inputs:', rules.inputs.map(i => i.fieldName));
    console.log('Rules mapped formulas count:', rules.formulas.length);

    // 2. Generate template in Database
    const metadata = {
      originalFileName: 'OP-OP V.Cutting Breeze Production.xlsx',
      categoryId: new mongoose.Types.ObjectId() // random valid ObjectId
    };
    
    console.log('Generating Template in DB...');
    const templateId = await generateTemplateFromRules(rules, metadata);
    console.log(`Template created with ID: ${templateId}`);

    // Fetch details to confirm
    const template = await Template.findById(templateId);
    const measurements = await TemplateMeasurement.find({ templateId });
    console.log(`Loaded template from DB: "${template.name}" with ${measurements.length} measurements.`);

    // 3. Setup Mock measurements for simulation
    const mockMeasurements = {};
    for (const m of measurements) {
      if (m.fieldName.toLowerCase().includes('width')) {
        mockMeasurements[m.fieldName] = 1200;
      } else if (m.fieldName.toLowerCase().includes('height')) {
        mockMeasurements[m.fieldName] = 1500;
      } else {
        mockMeasurements[m.fieldName] = 1; // serial/other inputs
      }
    }
    console.log('Mock measurements for simulation:', mockMeasurements);

    const lineItems = [{
      windowNo: 'W1',
      qty: 2,
      measurements: mockMeasurements
    }];

    // 4. Run calculation engine simulation
    console.log('Running calculation/simulation engine...');
    const simulationResult = await runProductionEngine(templateId, lineItems);

    console.log('\n=============================================');
    console.log('SIMULATION RESULTS');
    console.log('=============================================');
    console.log('Simulation scope variables calculated:');
    const firstScope = simulationResult.simulationData[0].scope;
    for (const [key, val] of Object.entries(firstScope)) {
      if (!key.startsWith('node_') && !key.startsWith('internal_')) {
        console.log(`  - ${key}: ${val}`);
      }
    }
    
    console.log('\nTotal BOM Consumption calculated:');
    simulationResult.totalBomConsumption.forEach(item => {
      console.log(`  - ${item.materialName} (${item.category}): ${item.qty} ${item.unit}`);
    });
    
    console.log('\nTotal Hardware Consumption calculated:');
    if (simulationResult.hardwareList) {
      simulationResult.hardwareList.forEach(item => {
        console.log(`  - ${item.hardwareName} (${item.group}): ${item.qty}`);
      });
    }

    console.log('\nSimulation completed successfully!');

  } catch (err) {
    console.error('Test execution failed:', err);
  } finally {
    console.log('\nClosing database connection...');
    await mongoose.connection.close();
  }
}

run();
