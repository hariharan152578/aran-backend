import connectDB from './src/config/db.js';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { translateFormulas } from './src/modules/configuration/services/FormulaTranslationService.js';
import WorkbookScan from './src/modules/configuration/models/WorkbookScan.js';
import util from 'util';

dotenv.config();

async function runTests() {
  console.log('Connecting to database...');
  await connectDB();

  try {
    console.log('\n=============================================');
    console.log('PHASE 5: Formula Translation Engine Testing');
    console.log('=============================================');

    const scan1 = await WorkbookScan.findOne({ fileName: 'Fixed Breeze Production.xlsx' });
    if (!scan1) {
      console.log('Fixed Breeze scan not found! Run Phase 1 first.');
      return;
    }

    console.log(`Translating formulas for ${scan1.fileName}...`);
    const translations = await translateFormulas(scan1._id);

    console.log('\n--- TRANSLATED FORMULAS ---');
    console.log(util.inspect(translations, { colors: true, depth: null }));

  } catch (err) {
    console.error('Test Failed:', err);
  } finally {
    console.log('\nClosing connection...');
    await mongoose.connection.close();
  }
}

runTests();
