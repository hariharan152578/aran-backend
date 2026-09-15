// Oracle verification: inject sample windows into the real workbook's formula sheet,
// compute expected cell values with the independent evaluator (_xleval), and compare to
// the React config's computeWindow/computeTotals outputs.
//
// A config may declare an `oracle` block:
//   oracle: {
//     workbook: '<abs path>', sheet: '<sheet name | undefined=first>',
//     firstRow: 6,                          // first data row in the production sheet
//     wnoCol: 'A', widthCol: 'B', heightCol: 'C',
//     sampleWindows: [{width, height, qty}],// qty>1 => inject that many identical rows
//     winCells:   { reactKey: 'D', ... },   // per-window: column letter, row = firstRow+physicalIndex
//     totalCells: { reactKey: 'H6', ... },  // order totals: absolute cell address
//     skip: ['key', ...],                   // react keys to NOT auto-check (e.g. derived-only)
//   }
// Physical rows: each window with qty>1 expands to qty identical rows (Excel has no qty col),
// so a React window {qty:2} is checked against two injected Excel rows.
import { loadSheet, ERR } from './_xleval.mjs';

export function oracleExpected(oracle) {
  const { sheet } = loadSheet(oracle.workbook, oracle.sheet);
  sheet.reset();
  const firstRow = oracle.firstRow;
  // Clear any pre-filled sample data in the input columns across the data-row range,
  // so injected windows are the ONLY inputs (some workbooks ship with sample rows).
  const lastRow = oracle.lastRow || (firstRow + 10);
  for (let r = firstRow; r <= lastRow; r++) {
    sheet.set((oracle.wnoCol || 'A') + r, '');
    sheet.set((oracle.widthCol || 'B') + r, '');
    sheet.set((oracle.heightCol || 'C') + r, '');
  }
  // expand windows by qty into physical rows
  const phys = [];
  oracle.sampleWindows.forEach((w) => {
    const q = Number(w.qty) || 1;
    for (let k = 0; k < q; k++) phys.push(w);
  });
  phys.forEach((w, idx) => {
    const r = firstRow + idx;
    sheet.set((oracle.wnoCol || 'A') + r, idx + 1);
    sheet.set((oracle.widthCol || 'B') + r, Number(w.width));
    sheet.set((oracle.heightCol || 'C') + r, Number(w.height));
  });
  const num = (v) => (v === '' || v === ERR || v === false || v === true) ? (v === true ? 1 : 0) : Number(v);
  // per-window expected: index by physical row, but React groups by window. We check the
  // FIRST physical row of each window (identical rows => same values).
  const winExpected = [];
  let physIdx = 0;
  oracle.sampleWindows.forEach((w) => {
    const r = firstRow + physIdx;
    const obj = {};
    for (const [key, col] of Object.entries(oracle.winCells || {})) obj[key] = num(sheet.eval(col + r));
    winExpected.push(obj);
    physIdx += Number(w.qty) || 1;
  });
  const totalsExpected = {};
  for (const [key, addr] of Object.entries(oracle.totalCells || {})) totalsExpected[key] = num(sheet.eval(addr));
  return { winExpected, totalsExpected };
}

export function verifyWithOracle(cfg) {
  const o = cfg.oracle;
  const { winExpected, totalsExpected } = oracleExpected(o);
  const results = cfg.sampleWindows0(); // helper returns sample windows for React side
  const computed = results.map((w) => ({ ...w, ...cfg.computeWindow(w) }));
  const totals = cfg.computeTotals(computed);
  const approx = (a, b) => Math.abs(Number(a) - Number(b)) < 0.01;
  const fails = [];
  const skip = new Set(o.skip || []);
  winExpected.forEach((exp, i) => {
    for (const [k, v] of Object.entries(exp)) {
      if (skip.has(k)) continue;
      if (!approx(computed[i][k], v)) fails.push(`  win[${i}].${k}: react ${computed[i][k]} vs excel ${v}`);
    }
  });
  for (const [k, v] of Object.entries(totalsExpected)) {
    if (skip.has(k)) continue;
    if (!approx(totals[k], v)) fails.push(`  totals.${k}: react ${totals[k]} vs excel ${v}`);
  }
  return { ok: fails.length === 0, fails, winExpected, totalsExpected };
}
