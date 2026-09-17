import { test } from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';
import { parseExcelWorkbook, summarizeExcelTabs, findInputColumns } from './excelStructureService.js';
import { runExcelEngine, TEMPLATE_STORAGE_DIR } from './excelEngine.js';

function createMockWorkbookBuffer() {
  const wb = XLSX.utils.book_new();

  // Tab 1: Calculation tab "FIX"
  const calcAoa = [
    ['FIX Production Sheet', '', '', '', ''],
    ['Order No', 'ORD-101', '', '', ''],
    ['', '', '', '', ''],
    ['Customer Window Input Table', '', '', '', ''],
    ['W.No', 'Width', 'Height', 'Sash Cut Width', 'Sash Cut Height'],
    [1, 1000, 800, { f: '=(B6-50)/2' }, { f: '=C6-60' }],
    ['', '', '', '', ''],
    ['Total Cut Bars', { f: '=CEILING(((SUM(B6:B6)+SUM(C6:C6))*2)/5850, 0.1)' }, '', '', '']
  ];
  const wsCalc = XLSX.utils.aoa_to_sheet(calcAoa);
  wsCalc['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 2 } }
  ];
  XLSX.utils.book_append_sheet(wb, wsCalc, 'FIX');

  // Tab 2: Material tab "Material & Hardware"
  const matAoa = [
    ['Material Consumed for this order', '', ''],
    ['FIX System', '', ''],
    ['S.No', 'Description', 'ORD-101'],
    [1, 'Outer Frame UPVC Profile', { f: '=FIX!B8' }],
    [2, 'Fixing Cleats (Hardware)', 8]
  ];
  const wsMat = XLSX.utils.aoa_to_sheet(matAoa);
  XLSX.utils.book_append_sheet(wb, wsMat, 'Material & Hardware');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

test('excelStructureService: parses sheets, merges, and input column hints', () => {
  const buf = createMockWorkbookBuffer();
  const parsed = parseExcelWorkbook(buf);

  assert.deepEqual(parsed.sheetNames, ['FIX', 'Material & Hardware']);

  const fixSheet = parsed.sheets['FIX'];
  assert.ok(fixSheet, 'FIX sheet should be present');
  assert.equal(fixSheet.merged_ranges.length, 2);

  const hints = fixSheet.input_field_hints;
  assert.ok(hints, 'Input field hints should be detected');
  assert.equal(hints.w_no_col, 'A');
  assert.equal(hints.width_col, 'B');
  assert.equal(hints.height_col, 'C');
  assert.equal(hints.header_row, 5);
  assert.equal(hints.data_start_row, 6);

  const summary = summarizeExcelTabs(parsed.sheets);
  assert.equal(summary.tabs.length, 2);
  assert.equal(summary.suggested.sheetName, 'FIX');
  assert.equal(summary.suggested.materialSheetName, 'Material & Hardware');
});

test('excelEngine: calculates formulas, cutting sizes and outputs standard contract', async () => {
  const buf = createMockWorkbookBuffer();
  const testTemplateId = '65f01234567890abcdef0001';

  // Save temporary test file to storage dir
  const filePath = path.join(TEMPLATE_STORAGE_DIR, `${testTemplateId}.xlsx`);
  fs.writeFileSync(filePath, buf);

  try {
    const mockTemplate = {
      _id: testTemplateId,
      name: 'Fixed Window Test',
      code: 'EX-FIX-TEST',
      templateType: 'EXCEL',
      googleSheet: {
        sheetName: 'FIX',
        materialSheetName: 'Material & Hardware',
        inputHints: {
          wNoCol: 'A',
          widthCol: 'B',
          heightCol: 'C',
          headerRow: 5,
          dataStartRow: 6,
          dataEndRow: 16
        },
        materialMapping: {
          mode: 'AUTO',
          blocks: []
        },
        defaultPrintPages: [
          { pageNumber: 1, title: 'Page 1', range: 'A1:E8' }
        ]
      },
      excelWorkbook: {
        filePath: `uploads/templates/${testTemplateId}.xlsx`
      }
    };

    const payload = {
      orderNo: 'ORD-999',
      windows: [
        { width: 1250, height: 960 }
      ]
    };

    const result = await runExcelEngine(mockTemplate, payload);

    assert.equal(result.templateId, testTemplateId);
    assert.equal(result.templateCode, 'EX-FIX-TEST');
    assert.ok(Array.isArray(result.cuttingList));
    assert.ok(Array.isArray(result.totalBomConsumption));
    assert.ok(result.sheetResult);
    assert.equal(result.sheetResult.sheetName, 'FIX');

    // Values verification:
    // Width (B6) was 1250, Sash Cut Width (D6) formula was =(B6-50)/2 => (1250-50)/2 = 600
    // Height (C6) was 960, Sash Cut Height (E6) formula was =C6-60 => 960-60 = 900
    const values = result.sheetResult.grid.values;
    const row6 = values[5]; // 0-indexed row 5 is Excel row 6
    assert.equal(row6[1], 1250, 'Width should be written to column B');
    assert.equal(row6[2], 960, 'Height should be written to column C');
    assert.equal(row6[3], 600, 'Calculated Sash Cut Width should be 600');
    assert.equal(row6[4], 900, 'Calculated Sash Cut Height should be 900');

    // Total cut bars formula preserved at row 8 (B8)
    const row8 = values[7];
    // ((1250 + 960)*2)/5850 = 4420 / 5850 = 0.7555... CEILING to 0.1 is 0.8
    assert.equal(row8[1], 0.8, 'Total Cut Bars should calculate to 0.8');

    // Material sheet reference =FIX!B8 should also be 0.8
    const matValues = result.sheetResult.materialGrid.values;
    assert.equal(matValues[3][2], 0.8, 'Material tab =FIX!B8 should resolve to 0.8');
  } finally {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
});

test('excelEngine: resilient calculation via base64 when disk file is absent', async () => {
  const buf = createMockWorkbookBuffer();
  const testTemplateId = '65f01234567890abcdef0002';

  const mockTemplate = {
    _id: testTemplateId,
    name: 'Fixed Window Base64 Test',
    code: 'EX-FIX-BASE64',
    templateType: 'EXCEL',
    googleSheet: {
      sheetName: 'FIX',
      materialSheetName: 'Material & Hardware',
      inputHints: {
        wNoCol: 'A',
        widthCol: 'B',
        heightCol: 'C',
        headerRow: 5,
        dataStartRow: 6,
        dataEndRow: 16
      }
    },
    excelWorkbook: {
      filePath: 'non_existent_path.xlsx',
      base64Data: buf.toString('base64')
    }
  };

  const payload = {
    orderNo: 'ORD-BASE64',
    windows: [{ width: 1000, height: 800 }]
  };

  const result = await runExcelEngine(mockTemplate, payload);
  assert.ok(result);
  assert.equal(result.templateCode, 'EX-FIX-BASE64');
  assert.ok(result.sheetResult.grid.values.length > 0);
});


