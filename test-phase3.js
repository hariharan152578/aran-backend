import connectDB from './src/config/db.js';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { recognizeStructures } from './src/modules/configuration/services/StructureRecognitionService.js';
import WorkbookScan from './src/modules/configuration/models/WorkbookScan.js';
import util from 'util';

dotenv.config();

async function runTests() {
  console.log('Connecting to database...');
  await connectDB();

  try {
    console.log('\n=============================================');
    console.log('PHASE 3: Structure Recognition Engine Testing');
    console.log('=============================================');

    // Get the scan for Fixed Breeze
    const scan1 = await WorkbookScan.findOne({ fileName: 'Fixed Breeze Production.xlsx' });
    if (!scan1) {
      console.log('Fixed Breeze scan not found! Run Phase 1 first.');
      return;
    }

    console.log(`Analyzing structures for ${scan1.fileName}...`);
    const result1 = await recognizeStructures(scan1._id);

    console.log('\n--- SCHEDULE TABLES ---');
    console.log(util.inspect(result1.schedules, { colors: true, depth: null }));

    console.log('\n--- BOM & HARDWARE TABLES ---');
    console.log(util.inspect(result1.bomTables, { colors: true, depth: null }));

    console.log('\n--- METADATA ---');
    console.log(util.inspect(result1.metadata, { colors: true, depth: null }));

  } catch (err) {
    console.error('Test Failed:', err);
  } finally {
    console.log('\nClosing connection...');
    await mongoose.connection.close();
  }
}

runTests();
