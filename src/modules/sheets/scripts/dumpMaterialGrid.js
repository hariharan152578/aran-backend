/**
 * Prints a material tab as the JSON grid that Apps Script's doPost returns
 * ({ startRow, startCol, values }), so mapper fixtures can be captured from a
 * real workbook instead of hand-written.
 *
 * The real workbooks live in the sibling project:
 *   node src/modules/sheets/scripts/dumpMaterialGrid.js "<path.xlsx>" ["Tab Name"]
 *
 * With no tab name it lists the tabs and dumps the first one that looks like a
 * material tab. Formula cells come through as their cached values, which is what
 * getValues() returns too.
 */

import XLSX from 'xlsx';
import path from 'node:path';

const [, , file, tabArg] = process.argv;

if (!file) {
  console.error('usage: dumpMaterialGrid.js <workbook.xlsx> [tabName]');
  process.exit(1);
}

const wb = XLSX.readFile(path.resolve(file));
const MATERIAL_RE = /material|hardware|hardwares|profile|consum/i;
const tab = tabArg || wb.SheetNames.find(n => MATERIAL_RE.test(n)) || wb.SheetNames[0];

if (!wb.Sheets[tab]) {
  console.error(`No tab "${tab}". Tabs: ${JSON.stringify(wb.SheetNames)}`);
  process.exit(1);
}

// defval:'' matches getValues(), which yields '' for blank cells rather than
// omitting them - the mapper's "blank means not in this BOM" rule depends on it.
const values = XLSX.utils.sheet_to_json(wb.Sheets[tab], { header: 1, defval: '' });
const width = Math.max(0, ...values.map(r => r.length));
const padded = values.map(r => [...r, ...Array(width - r.length).fill('')]);

console.error(`tabs: ${JSON.stringify(wb.SheetNames)}`);
console.error(`dumping "${tab}" (${padded.length}x${width})`);
console.log(JSON.stringify({ startRow: 1, startCol: 1, values: padded }, null, 2));
