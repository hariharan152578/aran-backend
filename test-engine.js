import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { runProductionEngine } from './src/modules/calculation-engine/evaluator.js';
import Template from './src/modules/configuration/models/Template.js';
import TemplateMeasurement from './src/modules/configuration/models/TemplateMeasurement.js';

dotenv.config();
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/aran-erp');

async function testEngine() {
  const templateId = '6a1ea9510eb86e3fb7a03cd0';
  const template = await Template.findById(templateId);
  if (!template) {
    console.log("Template not found!");
    process.exit(1);
  }
  
  console.log("Template:", template.name, template.version);

  const inputs = await TemplateMeasurement.find({ templateId });
  const mockMeasurements = {};
  for (const input of inputs) {
    mockMeasurements[input.fieldName] = 1000; // Mock 1000 for all
  }
  
  const lineItems = [{
    windowNo: 'W1',
    qty: 1,
    measurements: mockMeasurements
  }];

  try {
    const result = await runProductionEngine(template._id, lineItems);
    const data = result.simulationData[0].scope;
    
    console.log("\n--- Simulation Scope Results ---");
    for (const [key, val] of Object.entries(data)) {
      if (!key.startsWith('node_') && !key.startsWith('internal_')) {
        console.log(`${key}: ${val}`);
      }
    }
  } catch (err) {
    console.error("Simulation failed:", err);
  }
  
  process.exit(0);
}

testEngine().catch(console.error);
