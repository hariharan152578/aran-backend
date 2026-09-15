import xlsx from 'xlsx';
import WorkbookScan from '../models/WorkbookScan.js';

export const scanWorkbook = async (filePath, originalName) => {
  const startTime = Date.now();
  const workbook = xlsx.readFile(filePath);

  const sheets = [];
  const cells = [];
  const formulas = [];
  const mergedCells = [];

  let hiddenCount = 0;

  workbook.SheetNames.forEach((sheetName, index) => {
    // xlsx doesn't always strictly expose hidden flag cleanly in all versions without checking Workbook.Sheets
    const wbSheetMeta = workbook.Workbook && workbook.Workbook.Sheets && workbook.Workbook.Sheets[index];
    const isHidden = wbSheetMeta && wbSheetMeta.Hidden !== 0 && wbSheetMeta.Hidden !== undefined;
    
    if (isHidden) hiddenCount++;

    sheets.push({
      name: sheetName,
      index: index,
      hidden: !!isHidden
    });

    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return;

    // Handle Merged Cells
    if (sheet['!merges']) {
      sheet['!merges'].forEach(merge => {
        mergedCells.push({
          sheet: sheetName,
          s: merge.s,
          e: merge.e
        });
      });
    }

    // Iterate over all cells in sheet
    for (const key in sheet) {
      if (key[0] === '!') continue; // Skip metadata keys like !ref, !merges

      const cell = sheet[key];
      if (!cell) continue;

      if (cell.v !== undefined) {
        cells.push({
          sheet: sheetName,
          address: key,
          value: cell.v,
          format: cell.t // t is the type/format in xlsx
        });
      }

      if (cell.f !== undefined) {
        formulas.push({
          sheet: sheetName,
          address: key,
          formula: cell.f
        });
      }
    }
  });

  const processingTimeMs = Date.now() - startTime;

  const scanRecord = new WorkbookScan({
    fileName: originalName,
    sheets,
    cells,
    formulas,
    mergedCells,
    statistics: {
      totalSheets: sheets.length,
      totalCells: cells.length,
      totalFormulas: formulas.length,
      totalMerged: mergedCells.length,
      processingTimeMs
    }
  });

  await scanRecord.save();

  return {
    sheets,
    cells,
    formulas,
    mergedCells,
    statistics: scanRecord.statistics,
    scanId: scanRecord._id
  };
};
