import { parseExcelRules } from './src/modules/configuration/services/ExcelParserService.js';
import util from 'util';

import xlsx from 'xlsx';

const filePath = './temp_uploads/1780253230526-SL-M---SL-M Baydee BREEZE sash.xlsx';
const fileName = 'SL-M---SL-M Baydee BREEZE sash.xlsx';
const workbook = xlsx.readFile(filePath);
const matSheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('material')) || workbook.SheetNames[1];
const matSheet = workbook.Sheets[matSheetName];
const range = xlsx.utils.decode_range(matSheet['!ref']);
for (const key of Object.keys(matSheet)) {
  if (key[0] === '!') continue;
  const row = parseInt(key.replace(/[A-Z]/g, ''));
  if (row <= 10) {
    const cell = matSheet[key];
    console.log(`${key}: v=${cell.v}, f=${cell.f}`);
  }
}

const fixSheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('fix')) || workbook.SheetNames[0];
const fixSheet = workbook.Sheets[fixSheetName];
for (const key of Object.keys(fixSheet)) {
  if (key[0] === '!') continue;
  const cell = fixSheet[key];
  if (cell.v && typeof cell.v === 'string') {
    console.log(`${key}: ${cell.v}`);
  }
}

const result = parseExcelRules(filePath, fileName);

console.log(util.inspect(result.analysis, { depth: null, colors: true }));
console.log('Public Formulas:', result.formulas.filter(f => !f.isInternal).map(f => f.name));
console.log('Hardware:', result.hardware.map(h => h.hardwareName));
console.log('Materials Linked:', result.bom.filter(b => b.formulaRef).map(b => `${b.materialName} -> ${b.formulaRef}`));
