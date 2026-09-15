import fs from 'fs';
import mongoose from 'mongoose';

mongoose.connect('mongodb://127.0.0.1:27017/aran_erp').then(async () => {
  const Template = mongoose.model('Template', new mongoose.Schema({}, {strict:false}));
  const t = await Template.findOne({ name: 'FixedBreezeProduction' });
  if (!t) return console.log('Template not found');

  let code = t.reactCode;
  
  // 1. Change signature
  code = code.replace(
    /export default function FixedBreezeProduction\(\) \{/,
    'export default function FixedBreezeProduction({ mode, onChange }) {'
  );

  // 2. Add useEffect to trigger onChange
  const effectCode = `
  React.useEffect(() => {
    if (onChange) {
      onChange({
         hasRun,
         windows,
         results
      });
    }
  }, [hasRun, windows, results, onChange]);

  const results = useMemo(
`;
  code = code.replace(/const results = useMemo\(/, effectCode);

  // 3. Hide Publish/Go to Simulator buttons if mode === 'quotation'
  code = code.replace(
    /<div className="flex items-center gap-3">/,
    `{mode !== "quotation" && (<div className="flex items-center gap-3">`
  );
  code = code.replace(
    /Publish Template\n              <\/button>\n            <\/div>/,
    `Publish Template\n              </button>\n            </div>)}`
  );

  t.reactCode = code;
  await t.save();
  console.log('Template updated successfully');
  process.exit(0);
});
