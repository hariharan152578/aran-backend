import { MongoClient } from 'mongodb';
const c = new MongoClient('mongodb://127.0.0.1:27017'); await c.connect();
const db = c.db('aran_erp'); const col = db.collection('templates');
const codes = ['EXCEL-125128','EXCEL-125769','EXCEL-125794','EXCEL-125816'];
for (const code of codes) {
  const t = await col.findOne({ code });
  console.log('\n==', code, '|', t?.name);
  console.log('  keys:', Object.keys(t||{}).join(','));
  console.log('  sourceFile:', t?.sourceFile, '| sourcePath:', t?.sourcePath, '| excelPath:', t?.excelPath);
  console.log('  category:', t?.category, '| description:', t?.description);
}
await c.close();
