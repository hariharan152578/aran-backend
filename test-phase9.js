import connectDB from './src/config/db.js';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { processExcelToTemplate } from './src/modules/configuration/services/EnterpriseExtractionFacade.js';
import path from 'path';
import util from 'util';

dotenv.config();

async function runTests() {
  console.log('Connecting to database...');
  await connectDB();

  try {
    console.log('\n=============================================');
    console.log('PHASE 9: API Integration Testing (Facade)');
    console.log('=============================================');

    const filePath = path.resolve('./temp_uploads/Fixed Breeze Production.xlsx');
    // I need to copy the file to temp_uploads first because Phase 1 might look for it.
    // Actually scanWorkbook expects a valid path.
    // Since I don't have the original file path, I'll pass the benchmark file path.
    const benchmarkPath = path.resolve('./temp_uploads/1780397666809-Fixed Breeze Production.xlsx');

    console.log(`Running entire 8-phase pipeline on ${benchmarkPath}...`);
    const results = await processExcelToTemplate(benchmarkPath, 'Fixed Breeze Production.xlsx');

    console.log('\n--- FACADE OUTPUT (Legacy Format) ---');
    console.log(`Inputs found: ${results.inputs.length}`);
    console.log(results.inputs.map(i => i.fieldName));
    console.log(`Formulas found: ${results.formulas.length}`);
    console.log(`BOM found: ${results.bom.length}`);
    
    console.log('\nAll Formulas:');
    console.log(results.formulas.map(f => f.name));

  } catch (err) {
    console.error('Test Failed:', err);
  } finally {
    console.log('\nClosing connection...');
    await mongoose.connection.close();
  }
}

runTests();
