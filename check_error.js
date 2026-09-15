import connectDB from './src/config/db.js';
import mongoose from 'mongoose';
import ImportLog from './src/modules/configuration/models/ImportLog.js';

async function run() {
  await connectDB();
  const logs = await ImportLog.find({ status: 'FAILED' }).sort({ createdAt: -1 }).limit(1);
  if (logs.length > 0) {
    console.log("LATEST ERROR:", logs[0].errorDetails);
  } else {
    console.log("No failed import logs found.");
  }
  process.exit(0);
}
run();
