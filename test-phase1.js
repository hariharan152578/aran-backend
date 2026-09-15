import { parseExcelRules } from './src/modules/configuration/services/ExcelParserService.js';
import util from 'util';

console.log('\n=============================================');
console.log('BENCHMARK 1: Fixed Breeze Production');
console.log('=============================================');
const file1 = './temp_uploads/1780340103374-Fixed Breeze Production.xlsx';
const result1 = parseExcelRules(file1, 'Fixed Breeze Production.xlsx');
console.log(util.inspect(result1.formulas, { colors: true, depth: null }));


