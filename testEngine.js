import mongoose from 'mongoose';
import { runProductionEngine } from './src/modules/calculation-engine/evaluator.js';

async function test() {
  await mongoose.connect('mongodb://localhost:27017/aran_db');
  
  // Just mock the DB functions for testing
  const inputsDef = [
    { fieldName: "OrderNo", type: "text" },
    { fieldName: "WindowNo", type: "text" },
    { fieldName: "Width", type: "number" },
    { fieldName: "Height", type: "number" }
  ];
  
  const rulesDef = [
    {"name":"CurrentDate","formula":"TODAY()"},
    {"name":"OrderNumberReference","formula":"OrderNo"},
    {"name":"FrameModelLength","formula":"IF(Width=\"\", \"\", ((Width/2)-37))"},
    {"name":"WindowCount","formula":"COUNTA(WindowNo)"},
    {"name":"TotalWidth","formula":"SUM(Width)"},
    {"name":"TotalHeight","formula":"SUM(Height)"},
    {"name":"TotalFrameModelLength","formula":"SUM(FrameModelLength)"},
    {"name":"FixFrame","formula":"CEILING((((TotalWidth+TotalHeight)*2)/5850),0.1)"},
    {"name":"OPBead","formula":"FixFrame"}
  ];
  
  const bomMappings = [
    { materialName: "60 Small Casment Fram", formulaId: { name: "FixFrame" }, category: "Profiles" },
    { materialName: "60 Single Galzing Bead", formulaId: { name: "OPBead" }, category: "Profiles" }
  ];

  // We need to monkey patch the Mongoose models because evaluator.js requires them
  const Evaluator = await import('./src/modules/calculation-engine/evaluator.js');
  
  // Actually, evaluator.js does `await TemplateMeasurement.find({ templateId })`
  // We can't easily mock it without rewriting evaluator.js or inserting test data.
  // Let's insert test data!
  const Template = (await import('./src/modules/configuration/models/Template.js')).default;
  const TemplateMeasurement = (await import('./src/modules/configuration/models/TemplateMeasurement.js')).default;
  const TemplateFormula = (await import('./src/modules/configuration/models/TemplateFormula.js')).default;
  const TemplateBom = (await import('./src/modules/configuration/models/TemplateBom.js')).default;
  
  const t = await new Template({ name: 'Test', code: 'T1' }).save();
  await TemplateMeasurement.insertMany(inputsDef.map(i => ({...i, templateId: t._id})));
  
  const formulaIdMap = {};
  for(const r of rulesDef) {
    const f = await new TemplateFormula({...r, templateId: t._id}).save();
    formulaIdMap[r.name] = f._id;
  }
  
  await TemplateBom.insertMany(bomMappings.map(b => ({...b, templateId: t._id, formulaId: formulaIdMap[b.formulaId.name]})));
  
  const lineItems = [
    { windowNo: 'W1', qty: 1, measurements: { Width: 1200, Height: 1000, OrderNo: "O1", WindowNo: "W1" } }
  ];
  
  const result = await Evaluator.runProductionEngine(t._id, lineItems);
  console.log(JSON.stringify(result, null, 2));
  
  process.exit(0);
}

test().catch(console.error);
