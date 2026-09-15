import connectDB from './src/config/db.js';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { runSimulation } from './src/modules/configuration/services/TemplateSimulationService.js';
import WorkbookScan from './src/modules/configuration/models/WorkbookScan.js';
import util from 'util';

dotenv.config();

async function runTests() {
  console.log('Connecting to database...');
  await connectDB();

  try {
    console.log('\n=============================================');
    console.log('PHASE 7: Template Simulation Engine Testing');
    console.log('=============================================');

    const scan1 = await WorkbookScan.findOne({ fileName: 'Fixed Breeze Production.xlsx' });
    if (!scan1) {
      console.log('Fixed Breeze scan not found! Run Phase 1 first.');
      return;
    }

    console.log(`Running dry simulation for ${scan1.fileName}...`);
    const results = await runSimulation(scan1._id);

    console.log('\n--- SIMULATED INPUTS ---');
    console.log(util.inspect(results.simulatedInputs, { colors: true, depth: null }));

    console.log('\n--- EVALUATED RULES ---');
    console.log(util.inspect(results.evaluatedRules, { colors: true, depth: null }));

  } catch (err) {
    console.error('Test Failed:', err);
  } finally {
    console.log('\nClosing connection...');
    await mongoose.connection.close();
  }
}

runTests();
