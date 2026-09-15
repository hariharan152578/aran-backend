import connectDB from './src/config/db.js';
import WorkbookScan from './src/modules/configuration/models/WorkbookScan.js';
import mongoose from 'mongoose';

async function run() {
  await connectDB();
  const scan = await WorkbookScan.findOne({ fileName: 'Fixed Breeze Production.xlsx' });
  if (scan) {
    console.log(scan.formulas);
  }
  mongoose.connection.close();
}
run();
