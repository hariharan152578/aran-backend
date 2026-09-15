import mongoose from 'mongoose';
import dotenv from 'dotenv';
import TemplateFormula from './src/modules/configuration/models/TemplateFormula.js';
import GraphNode from './src/modules/configuration/models/GraphNode.js';
import Template from './src/modules/configuration/models/Template.js';

dotenv.config();
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/aran-erp');

async function check() {
  const templateId = '6a1ea9510eb86e3fb7a03cd0';
  const template = await Template.findById(templateId);
  
  const f = await TemplateFormula.findOne({ templateId, name: 'Derived Width' });
  console.log("Formula in DB:", f.formula);
  
  const allNodes = await GraphNode.find({ scanId: template.scanId }).lean();
  console.log(`Found ${allNodes.length} total nodes for scanId ${template.scanId}`);
  for (const node of allNodes) {
     if (node.alias && node.alias.includes('Width')) {
         console.log(`Node ${node.address} | alias: "${node.alias}" | classification: ${node.classification} | translated: ${node.translatedFormula} | raw: ${node.rawFormula}`);
     }
  }

  process.exit(0);
}

check().catch(console.error);
