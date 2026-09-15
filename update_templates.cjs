const mongoose = require('mongoose');

mongoose.connect('mongodb://127.0.0.1:27017/aran_erp').then(async () => {
  const Template = mongoose.connection.collection('templates');
  const templates = await Template.find({ templateType: 'REACT_COMPONENT' }).toArray();
  for (const t of templates) {
    let code = t.reactCode;
    // Replace the totals check
    code = code.replace(/if \(!hasRun \|\| results\.length === 0\) return null;/g, 'if (results.length === 0) return null;');
    // We also want hasRun to always be true so Quotations.jsx sees it
    code = code.replace(/const \[hasRun, setHasRun\] = useState\(false\);/g, 'const [hasRun, setHasRun] = useState(true);');
    
    await Template.updateOne({ _id: t._id }, { $set: { reactCode: code } });
    console.log('Updated', t.name);
  }
  mongoose.disconnect();
});
