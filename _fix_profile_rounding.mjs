// One-off fix: profile bars were rounded per-window then summed, inflating totals
// (e.g. Louver order A462 showed 3.6 bars instead of 3.2). Correct behaviour is to
// sum the raw per-window lengths first, then CEILING(total, 0.1) once — matching the
// client's Excel sheets and the `computeTotals` pattern used by the other 63 templates.
//
// This patches the stored reactCode for the only two templates that still carry the bug:
//   EXCEL-526132  Fixed Breeze Production
//   EXCEL-122780  Louver Breeze Production
//
// Usage:  node _fix_profile_rounding.mjs [--dry]
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes('--dry');

// ---- new function source (copied 1:1 from cfg_fixed_louver.mjs) ----
const FIXED_COMPUTE = `const computeWindow = (w) => {
  const width = Number(w.width) || 0;
  const height = Number(w.height) || 0;
  const qty = Number(w.qty) || 0;

  const opBeadCut = width === 0 ? 0 : width / 2 - 37;

  return { width, height, qty, opBeadCut };
};

const computeTotals = (results) => {
  const ceil1 = (x) => (x === 0 ? 0 : Math.ceil(x * 10) / 10);
  const sumW = results.reduce((a, r) => a + (Number(r.width) || 0) * (Number(r.qty) || 0), 0);
  const sumH = results.reduce((a, r) => a + (Number(r.height) || 0) * (Number(r.qty) || 0), 0);
  const fixFrameBars = ceil1(((sumW + sumH) * 2) / 5850);
  const opBeadBars = fixFrameBars;
  return { fixFrameBars, opBeadBars };
};`;

const LOUVER_COMPUTE = `const computeWindow = (w) => {
  const width = Number(w.width) || 0;
  const height = Number(w.height) || 0;
  const qty = Number(w.qty) || 0;

  return { width, height, qty };
};

const computeTotals = (results) => {
  const ceil1 = (x) => (x === 0 ? 0 : Math.ceil(x * 10) / 10);
  const sumW = results.reduce((a, r) => a + (Number(r.width) || 0) * (Number(r.qty) || 0), 0);
  const sumH = results.reduce((a, r) => a + (Number(r.height) || 0) * (Number(r.qty) || 0), 0);
  const fixFrameBars = ceil1(((sumW + sumH) * 2) / 5850);
  return { fixFrameBars };
};`;

// The in-component preview totals block — replace the per-window reduce with computeTotals().
const NEW_TOTALS_MEMO = `const totals = useMemo(() => {
    if (!hasRun || results.length === 0) return null;
    return computeTotals(results);
  }, [results, hasRun]);`;

// ---- generic splice helpers ----
function replaceComputeWindow(rc, replacement) {
  const start = rc.indexOf('const computeWindow = (w) => {');
  if (start === -1) throw new Error('computeWindow not found');
  // end at the first "\n};" that closes the function
  const end = rc.indexOf('\n};', start);
  if (end === -1) throw new Error('computeWindow end not found');
  return rc.slice(0, start) + replacement + rc.slice(end + 3);
}

function replaceTotalsMemo(rc) {
  const start = rc.indexOf('const totals = useMemo(() => {');
  if (start === -1) throw new Error('totals useMemo not found');
  const marker = '}, [results, hasRun]);';
  const end = rc.indexOf(marker, start);
  if (end === -1) throw new Error('totals useMemo end not found');
  return rc.slice(0, start) + NEW_TOTALS_MEMO + rc.slice(end + marker.length);
}

// ---- assertion: evaluate the new compute fns on the A462 Louver order -> must be 3.2 ----
function assertA462() {
  const ceil1 = (x) => (x === 0 ? 0 : Math.ceil(x * 10) / 10);
  const wins = [
    [628, 577], [602, 606], [590, 450], [621, 558],
    [558, 526], [571, 444], [615, 590], [577, 558],
  ].map(([width, height]) => ({ width, height, qty: 1 }));
  const sumW = wins.reduce((a, r) => a + r.width * r.qty, 0);
  const sumH = wins.reduce((a, r) => a + r.height * r.qty, 0);
  const fixFrameBars = ceil1(((sumW + sumH) * 2) / 5850);
  if (Math.abs(fixFrameBars - 3.2) > 1e-9) {
    throw new Error(`A462 self-check failed: got ${fixFrameBars}, expected 3.2`);
  }
  console.log(`✓ A462 self-check: sumW=${sumW} sumH=${sumH} -> fixFrameBars=${fixFrameBars} (expected 3.2)`);
}

const TARGETS = [
  { code: 'EXCEL-526132', label: 'Fixed Breeze Production', compute: FIXED_COMPUTE },
  { code: 'EXCEL-122780', label: 'Louver Breeze Production', compute: LOUVER_COMPUTE },
];

async function run() {
  assertA462();

  await mongoose.connect('mongodb://127.0.0.1:27017/aran_erp', { serverSelectionTimeoutMS: 5000 });
  const col = mongoose.connection.collection('templates');

  for (const t of TARGETS) {
    const doc = await col.findOne({ code: t.code });
    if (!doc) { console.log(`!! ${t.code} not found — skipping`); continue; }
    const orig = doc.reactCode || '';

    // backup
    const backupFile = path.join(__dirname, `_backup_profile_fix_${t.code}.jsx`);
    fs.writeFileSync(backupFile, orig, 'utf8');
    console.log(`• ${t.code} ${t.label}: backed up ${orig.length} chars -> ${path.basename(backupFile)}`);

    let patched = replaceComputeWindow(orig, t.compute);
    patched = replaceTotalsMemo(patched);

    // sanity gates
    const okTotals = /const computeTotals = \(results\) =>/.test(patched);
    const noPerWindowCeil = !/Math\.ceil\(rawBars/.test(patched);
    const memoOk = patched.includes('return computeTotals(results);');
    if (!okTotals || !noPerWindowCeil || !memoOk) {
      throw new Error(`${t.code} post-patch gate failed: computeTotals=${okTotals} noPerWindowCeil=${noPerWindowCeil} memo=${memoOk}`);
    }

    if (DRY) {
      console.log(`  --dry: would write ${patched.length} chars (was ${orig.length}). Gates OK.`);
      continue;
    }
    await col.updateOne({ code: t.code }, { $set: { reactCode: patched } });
    console.log(`  updated reactCode (${orig.length} -> ${patched.length} chars). computeTotals present, per-window ceil removed.`);
  }

  await mongoose.disconnect();
  console.log(DRY ? 'DRY DONE — nothing written.' : 'DONE.');
}

run().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
