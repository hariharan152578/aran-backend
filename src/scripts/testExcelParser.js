import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';
import { parseExcelRules } from '../modules/configuration/excelImporter.js';

const testParser = () => {
  console.log('--- STARTING EXCEL PARSER HEURISTICS TEST ---');
  
  // 1. Create a mock spreadsheet
  const wb = xlsx.utils.book_new();
  
  // We represent the sheet content
  const data = [
    ['width', 1500],
    ['height', 2000],
    ['', ''],
    ['Outer Frame UPVC Profile', { f: '=(B1+B2)*2/5850' }],
    ['Glazing Glass Area', { f: '=B1*B2/1000000' }],
    ['EPDM Rubber Gasket', { f: '=(B1+B2)*4/1000' }]
  ];
  
  // Build sheet manually to include formulas properly
  const ws = {};
  
  // Set dimensions
  ws['!ref'] = 'A1:B6';
  
  // Set cell values and formulas
  // Row 1: width
  ws['A1'] = { t: 's', v: 'width' };
  ws['B1'] = { t: 'n', v: 1500 };
  
  // Row 2: height
  ws['A2'] = { t: 's', v: 'height' };
  ws['B2'] = { t: 'n', v: 2000 };
  
  // Row 3: empty
  ws['A3'] = { t: 's', v: '' };
  ws['B3'] = { t: 's', v: '' };
  
  // Row 4: Outer Frame formula
  ws['A4'] = { t: 's', v: 'Outer Frame UPVC Profile' };
  ws['B4'] = { t: 'n', v: 1.196, f: '=(B1+B2)*2/5850' };
  
  // Row 5: Glass formula
  ws['A5'] = { t: 's', v: 'Glazing Glass Area' };
  ws['B5'] = { t: 'n', v: 3.0, f: '=B1*B2/1000000' };
  
  // Row 6: Rubber formula
  ws['A6'] = { t: 's', v: 'EPDM Rubber Gasket' };
  ws['B6'] = { t: 'n', v: 14.0, f: '=(B1+B2)*4/1000' };
  
  xlsx.utils.book_append_sheet(wb, ws, 'Calculations');
  
  const testFilePath = path.join('.', 'temp_test_calculator.xlsx');
  xlsx.writeFile(wb, testFilePath);
  console.log(`Saved mock Excel file to: ${testFilePath}`);
  
  // 2. Parse the Excel file using our module
  const result = parseExcelRules(testFilePath, 'temp_test_calculator.xlsx');
  
  console.log('\n--- EXTRACTED RESULTS ---');
  console.log('Inputs:', JSON.stringify(result.inputs, null, 2));
  console.log('Formulas:', JSON.stringify(result.formulas, null, 2));
  console.log('Materials:', JSON.stringify(result.materials, null, 2));
  
  // 3. Perform assertions
  const hasWidth = result.inputs.some(i => i.name === 'width');
  const hasHeight = result.inputs.some(i => i.name === 'height');
  
  const outerFrameFormula = result.formulas.find(f => f.name.includes('OuterFrame'));
  const glassFormula = result.formulas.find(f => f.name.includes('Glazing'));
  
  console.log('\n--- VERIFICATION ASSERTS ---');
  console.log('Detects width variable:', hasWidth ? 'PASS' : 'FAIL');
  console.log('Detects height variable:', hasHeight ? 'PASS' : 'FAIL');
  console.log('Extracted OuterFrame formula expression:', outerFrameFormula ? outerFrameFormula.expression : 'NOT FOUND');
  console.log('Extracted Glass formula expression:', glassFormula ? glassFormula.expression : 'NOT FOUND');
  
  // Clean up
  try {
    fs.unlinkSync(testFilePath);
    console.log(`Deleted temporary test file: ${testFilePath}`);
  } catch (e) {
    console.error('Error cleaning up test file:', e);
  }
  
  if (hasWidth && hasHeight && outerFrameFormula && glassFormula) {
    console.log('\nSUCCESS: Excel rule extraction verified successfully!');
    process.exit(0);
  } else {
    console.log('\nFAILURE: Excel rule extraction failed verification checks.');
    process.exit(1);
  }
};

testParser();
