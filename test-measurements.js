import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Template from './src/modules/configuration/models/Template.js';
import TemplateMeasurement from './src/modules/configuration/models/TemplateMeasurement.js';

dotenv.config();
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/aran-erp');

async function run() {
  const template = await Template.findOne().sort({ createdAt: -1 });
  const measurements = await TemplateMeasurement.find({ templateId: template._id });
  
  console.log("Measurements:");
  measurements.forEach(m => console.log(`- ${m.fieldName}`));
  process.exit(0);
}

run().catch(console.error);
