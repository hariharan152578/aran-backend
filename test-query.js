import mongoose from 'mongoose';
import Template from './src/modules/configuration/models/Template.js';

async function run() {
  await mongoose.connect('mongodb://localhost:27017/aran_erp');
  console.log("Connected to MongoDB.");

  const templates = await Template.find({ templateType: 'REACT_COMPONENT' });
  console.log(`Found ${templates.length} React templates.`);

  for (const t of templates) {
    console.log("-----------------------------------------");
    console.log("ID:", t._id);
    console.log("Name:", t.name);
    if (t.reactCode) {
      const lines = t.reactCode.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("```")) {
          console.log(`Line ${i + 1}: "${lines[i]}"`);
        }
      }
    }
  }

  await mongoose.disconnect();
}

run().catch(console.error);
