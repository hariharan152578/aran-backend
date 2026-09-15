import connectDB from './src/config/db.js';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { recognizeStructures } from './src/modules/configuration/services/StructureRecognitionService.js';
import { classifyNodes } from './src/modules/configuration/services/BusinessClassificationService.js';
import WorkbookScan from './src/modules/configuration/models/WorkbookScan.js';
import GraphNode from './src/modules/configuration/models/GraphNode.js';
import util from 'util';

dotenv.config();

async function runTests() {
  console.log('Connecting to database...');
  await connectDB();

  try {
    console.log('\n=============================================');
    console.log('PHASE 4: Business Classification Engine Testing');
    console.log('=============================================');

    const scan1 = await WorkbookScan.findOne({ fileName: 'Fixed Breeze Production.xlsx' });
    if (!scan1) {
      console.log('Fixed Breeze scan not found! Run Phase 1 first.');
      return;
    }

    console.log(`Recognizing structures for ${scan1.fileName}...`);
    const structures = await recognizeStructures(scan1._id);

    console.log(`Classifying nodes...`);
    const result = await classifyNodes(scan1._id, structures);
    console.log(`Successfully classified ${result.classifiedCount} out of ${result.totalNodes} nodes.`);

    console.log('\n--- SAMPLE CLASSIFIED NODES ---');
    const sampleNodes = await GraphNode.find({ scanId: scan1._id, classification: { $ne: null } });
    
    // Group by classification
    const grouped = {};
    for (const node of sampleNodes) {
       if (!grouped[node.classification]) grouped[node.classification] = [];
       grouped[node.classification].push(`${node.sheet}!${node.address} [Alias: ${node.alias || 'N/A'}]`);
    }

    console.log(util.inspect(grouped, { colors: true, depth: null }));

  } catch (err) {
    console.error('Test Failed:', err);
  } finally {
    console.log('\nClosing connection...');
    await mongoose.connection.close();
  }
}

runTests();
