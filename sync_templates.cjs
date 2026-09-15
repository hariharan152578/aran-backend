const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const mongoURI = 'mongodb://localhost:27017/aran_erp';
const TPL_DIR = 'E:/work files/Hari anna/test/test/aran/frontend/Breeze templates';

function extractFn(code) {
  const match = code.match(/export default function\s+([A-Za-z0-9_]+)/);
  return match ? match[1] : null;
}

mongoose.connect(mongoURI).then(async () => {
  const collection = mongoose.connection.db.collection('templates');
  const templates = await collection.find({ reactCode: { $exists: true } }).toArray();
  const files = fs.readdirSync(TPL_DIR).filter(f => f.endsWith('.jsx'));

  let updated = 0;

  for (const file of files) {
    const src = fs.readFileSync(path.join(TPL_DIR, file), 'utf8');
    const fnName = extractFn(src);
    if (!fnName) {
      console.log('NO FN:', file);
      continue;
    }

    let matchedTpl = null;
    for (const tpl of templates) {
      if (tpl.reactCode) {
        const tplFn = extractFn(tpl.reactCode);
        if (tplFn === fnName) {
          matchedTpl = tpl;
          break;
        }
      }
    }

    if (matchedTpl) {
      await collection.updateOne({ _id: matchedTpl._id }, { $set: { reactCode: src } });
      console.log('UPDATED:', file, '->', matchedTpl.name);
      updated++;
    } else {
      console.log('NO DB MATCH FOR:', file, '(Fn: ' + fnName + ')');
    }
  }

  console.log('Total updated:', updated);
  process.exit(0);
});
