import connectDB from './src/config/db.js';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { buildDependencyGraph } from './src/modules/configuration/services/DependencyGraphService.js';
import WorkbookScan from './src/modules/configuration/models/WorkbookScan.js';
import util from 'util';

dotenv.config();

async function runTests() {
  console.log('Connecting to database...');
  await connectDB();

  try {
    console.log('\n=============================================');
    console.log('PHASE 2: Dependency Graph Engine Testing');
    console.log('=============================================');

    // Get the scan for Fixed Breeze
    const scan1 = await WorkbookScan.findOne({ fileName: 'Fixed Breeze Production.xlsx' });
    if (!scan1) {
      console.log('Fixed Breeze scan not found! Run Phase 1 first.');
      return;
    }

    console.log(`Building graph for ${scan1.fileName} (Scan ID: ${scan1._id})...`);
    const result1 = await buildDependencyGraph(scan1._id);

    console.log('\n--- GRAPH STATISTICS ---');
    console.log('Total Nodes:', result1.nodes.length);
    console.log('Total Edges:', result1.edges.length);

    console.log('\n--- SAMPLE NODE (FORMULA) ---');
    const sampleNode = result1.nodes.find(n => n.type === 'FORMULA' && n.address === 'H6');
    console.log(sampleNode);

    console.log('\n--- EDGES FOR SAMPLE NODE (H6) ---');
    const sampleEdges = result1.edges.filter(e => e.targetNodeId.equals(sampleNode._id));
    console.log(sampleEdges.map(e => `${e.sourceAddress} -> ${e.targetAddress}`));
    
    console.log('\n--- EDGES FOR RANGE (A15 - COUNTA) ---');
    const rangeNode = result1.nodes.find(n => n.address === 'A15');
    if (rangeNode) {
       const rangeEdges = result1.edges.filter(e => e.targetNodeId.equals(rangeNode._id));
       console.log(`Target: ${rangeNode.rawFormula}`);
       console.log(`Dependencies: ${rangeEdges.length} edges`);
       console.log(rangeEdges.map(e => e.sourceAddress).join(', '));
    }

  } catch (err) {
    console.error('Test Failed:', err);
  } finally {
    console.log('\nClosing connection...');
    await mongoose.connection.close();
  }
}

runTests();
