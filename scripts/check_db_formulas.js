import mongoose from 'mongoose';

mongoose.connect('mongodb://127.0.0.1:27017/aran_erp').then(async () => {
  const TemplateFormula = mongoose.model('TemplateFormula', new mongoose.Schema({}, {strict:false}));
  const Template = mongoose.model('Template', new mongoose.Schema({}, {strict:false}));
  
  const templates = await Template.find({}, 'name code');
  for (const t of templates) {
    const formulas = await TemplateFormula.find({ templateId: t._id });
    console.log(`\n--- Formulas for template: ${t.name} (${t.code}, ID: ${t._id}) ---`);
    console.log(formulas.map(f => ({ name: f.name, formula: f.formula, group: f.group })));
  }

  process.exit(0);
});
