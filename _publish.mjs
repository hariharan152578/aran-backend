// Driver: import a config module, verify each config's compute fns against expected Excel values,
// then generate .jsx, write it, and update the DB row + measurements.
// Usage: node _publish.mjs <configFile.mjs> [--dry]
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { buildTemplate } from './_gen.mjs';
import { compileCheck } from './_compilecheck.mjs';
import { oracleExpected } from './_oracle.mjs';

const TPL_DIR = 'E:/work files/Hari anna/test/test/aran/frontend/Breeze templates';
const cfgFile = process.argv[2];
const dry = process.argv.includes('--dry');
if (!cfgFile) { console.error('need config file'); process.exit(1); }

const mod = await import('file://' + path.resolve(cfgFile));
const configs = mod.CONFIGS;

// ---- verification ----
function approx(a, b) { return Math.abs(Number(a) - Number(b)) < 0.005; }
let allOk = true;
for (const cfg of configs) {
  let windows, expectWindow, expectTotals, mode;
  if (cfg.oracle) {
    // Live Excel-engine oracle: compute expected values from the workbook's own formulas.
    const { winExpected, totalsExpected } = oracleExpected(cfg.oracle);
    windows = cfg.oracle.sampleWindows.map((w, i) => ({ id: i + 1, wno: `W${i + 1}`, ...w }));
    expectWindow = winExpected; expectTotals = totalsExpected; mode = 'ORACLE';
  } else if (cfg.verify) {
    windows = cfg.verify.windows; expectWindow = cfg.verify.expectWindow; expectTotals = cfg.verify.expectTotals; mode = 'STATIC';
  } else { console.log(`!! ${cfg.code} has no verify/oracle block`); allOk = false; continue; }

  const results = windows.map((w) => ({ ...w, ...cfg.computeWindow(w) }));
  const totals = cfg.computeTotals(results);
  let ok = true;
  const fails = [];
  const skip = new Set((cfg.oracle && cfg.oracle.skip) || []);
  if (expectWindow) {
    expectWindow.forEach((exp, i) => {
      for (const [k, v] of Object.entries(exp)) {
        if (skip.has(k)) continue;
        if (!approx(results[i][k], v)) { ok = false; fails.push(`  win[${i}].${k}: react ${results[i][k]} vs excel ${v}`); }
      }
    });
  }
  if (expectTotals) {
    for (const [k, v] of Object.entries(expectTotals)) {
      if (skip.has(k)) continue;
      if (!approx(totals[k], v)) { ok = false; fails.push(`  totals.${k}: react ${totals[k]} vs excel ${v}`); }
    }
  }
  if (ok) console.log(`✓ VERIFY[${mode}] ${cfg.code} ${cfg.title}`);
  else { console.log(`✗ VERIFY[${mode}] FAILED ${cfg.code} ${cfg.title}`); fails.forEach((f) => console.log(f)); allOk = false; }
}
if (!allOk) { console.error('\nVERIFICATION FAILED — nothing published.'); process.exit(2); }

// ---- compile gate ----
for (const cfg of configs) {
  const r = compileCheck(cfg);
  if (r.ok) console.log(`✓ COMPILE ${cfg.code}`);
  else { console.log(`✗ COMPILE ${cfg.code} [${r.stage}] ${r.err}`); allOk = false; }
}
if (!allOk) { console.error('\nCOMPILE FAILED — nothing published.'); process.exit(2); }
if (dry) { console.log('\n--dry: verification + compile passed, not writing.'); process.exit(0); }

// ---- write jsx + publish ----
await mongoose.connect('mongodb://127.0.0.1:27017/aran_erp');
const db = mongoose.connection;
for (const cfg of configs) {
  const jsx = buildTemplate(cfg);
  const file = path.join(TPL_DIR, cfg.fileName);
  fs.writeFileSync(file, jsx, 'utf8');
  const t = await db.collection('templates').findOne({ code: cfg.code });
  if (!t) { console.log(`!! no DB row for ${cfg.code}`); continue; }
  await db.collection('templates').updateOne({ code: cfg.code },
    { $set: { reactCode: jsx, templateType: 'REACT_COMPONENT', status: 'PUBLISHED' } });
  await db.collection('templatemeasurements').deleteMany({ templateId: t._id });
  await db.collection('templatemeasurements').insertMany(
    ['Width', 'Height', 'Qty'].map((f, i) => ({
      templateId: t._id, fieldName: f, type: 'number', required: true, visible: true, order: i,
    })));
  console.log(`published ${cfg.code} -> ${cfg.fileName}`);
}
await mongoose.disconnect();
console.log('DONE');
