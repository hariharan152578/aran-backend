import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import XLSX from 'xlsx';
import formula from 'xlsx-calc';
import Template from '../configuration/models/Template.js';
import TemplateSheetStructure from '../configuration/models/TemplateSheetStructure.js';
import { resolveWindows, pickDimension } from './sheetEngine.js';
import { mapMaterialGrid, mapGlassBlock } from './materialGridMapper.js';
import { columnToLetter, columnLetterToIndex } from './excelStructureService.js';

export const TEMPLATE_STORAGE_DIR = path.resolve(process.cwd(), 'uploads/templates');

// Ensure directory exists
if (!fs.existsSync(TEMPLATE_STORAGE_DIR)) {
  fs.mkdirSync(TEMPLATE_STORAGE_DIR, { recursive: true });
}

/**
 * Resolves the physical disk path for an Excel template workbook.
 */
export function getTemplateFilePath(template) {
  if (template?.excelWorkbook?.filePath) {
    const directPath = path.isAbsolute(template.excelWorkbook.filePath)
      ? template.excelWorkbook.filePath
      : path.resolve(process.cwd(), template.excelWorkbook.filePath);
    if (fs.existsSync(directPath)) return directPath;
  }

  // Fallback: standard location by template ID
  const standardPath = path.join(TEMPLATE_STORAGE_DIR, `${template._id || template.id}.xlsx`);
  if (fs.existsSync(standardPath)) return standardPath;

  // Fallback: by code
  if (template.code) {
    const codePath = path.join(TEMPLATE_STORAGE_DIR, `${template.code}.xlsx`);
    if (fs.existsSync(codePath)) return codePath;
  }

  return null;
}

/**
 * Executes formula recalculation locally in-memory for an EXCEL template.
 *
 * Emits the exact same contract as runSheetEngine and runProductionEngine:
 *   { totalBomConsumption, cuttingList, glassList, hardwareList, simulationData, sheetResult }
 *
 * @param {Object} template Mongoose Template document (templateType === 'EXCEL')
 * @param {Object} payload  { windows, lineItems, orderNo }
 */
export async function runExcelEngine(template, payload = {}) {
  const gs = template.googleSheet || {};
  const warnings = [];

  const sheetName = gs.sheetName;
  if (!sheetName) {
    throw Object.assign(new Error('This Excel template has no calculation tab selected.'), { status: 422 });
  }

  const { windows, skipped } = resolveWindows(payload);
  if (windows.length === 0) {
    throw Object.assign(
      new Error('No usable window dimensions were supplied. Each window needs a width and a height.'),
      { status: 422 }
    );
  }
  if (skipped.length > 0) {
    warnings.push(`Skipped ${skipped.length} item(s) with no width/height: ${skipped.join(', ')}.`);
  }

  const filePath = getTemplateFilePath(template);
  if (!filePath) {
    throw Object.assign(
      new Error(`Excel workbook file not found for template "${template.name}". Please re-upload the .xlsx file.`),
      { status: 404 }
    );
  }

  const startTime = Date.now();

  // Read workbook fresh into memory so calculations never mutate the master template file
  const wb = XLSX.readFile(filePath, {
    cellFormula: true,
    cellStyles: true,
    cellDates: true,
    sheetStubs: true
  });

  const ws = wb.Sheets[sheetName];
  if (!ws) {
    throw Object.assign(
      new Error(`Tab "${sheetName}" not found in workbook. Available tabs: ${wb.SheetNames.join(', ')}`),
      { status: 422 }
    );
  }

  // Determine input columns (support both camelCase and snake_case)
  const hints = gs.inputHints || {};
  const wNoColLetter = hints.wNoCol || hints.w_no_col;
  const widthColLetter = hints.widthCol || hints.width_col;
  const heightColLetter = hints.heightCol || hints.height_col;
  const wNoCol = wNoColLetter ? columnLetterToIndex(wNoColLetter) : 1;
  const widthCol = widthColLetter ? columnLetterToIndex(widthColLetter) : 2;
  const heightCol = heightColLetter ? columnLetterToIndex(heightColLetter) : 3;
  const headerRow = Number(hints.headerRow || hints.header_row) || 5;
  const dataStartRow = Number(hints.dataStartRow || hints.data_start_row) || (headerRow + 1);
  const configuredEndRow = Number(hints.dataEndRow || hints.data_end_row) || (dataStartRow + 10);

  // Dynamically detect where totals or formula rows begin to guarantee we NEVER overwrite formulas
  let formulaStartRow = null;
  const checkCols = [wNoCol, widthCol, heightCol].filter(Boolean);
  for (let r = dataStartRow; r <= dataStartRow + 50; r++) {
    let hasFormula = false;
    for (const cIdx of checkCols) {
      const addr = columnToLetter(cIdx) + r;
      if (ws[addr]?.f) {
        hasFormula = true;
        break;
      }
    }
    if (!hasFormula) {
      for (let c = 1; c <= 4; c++) {
        const addr = columnToLetter(c) + r;
        if (ws[addr]?.f && /sum|count|average|subtotal/i.test(ws[addr].f)) {
          hasFormula = true;
          break;
        }
      }
    }
    if (hasFormula) {
      formulaStartRow = r;
      break;
    }
  }

  // Safe upper bound for data rows
  const effectiveDataEndRow = formulaStartRow
    ? Math.min(configuredEndRow, formulaStartRow - 1)
    : configuredEndRow;

  // Clear existing values in the user input rows (NEVER clear formula cells)
  for (let r = dataStartRow; r <= effectiveDataEndRow; r++) {
    if (wNoCol) {
      const addr = columnToLetter(wNoCol) + r;
      if (ws[addr] && !ws[addr].f) ws[addr] = { t: 's', v: '' };
    }
    if (widthCol) {
      const addr = columnToLetter(widthCol) + r;
      if (ws[addr] && !ws[addr].f) ws[addr] = { t: 's', v: '' };
    }
    if (heightCol) {
      const addr = columnToLetter(heightCol) + r;
      if (ws[addr] && !ws[addr].f) ws[addr] = { t: 's', v: '' };
    }
  }

  // Inject user inputs (never overwrite formula cells)
  windows.forEach((win, i) => {
    const row = dataStartRow + i;
    if (row > effectiveDataEndRow) {
      warnings.push(`Window #${i + 1} exceeds maximum template input row (${effectiveDataEndRow}).`);
      return;
    }
    if (wNoCol) {
      const addr = columnToLetter(wNoCol) + row;
      if (!ws[addr]?.f) ws[addr] = { t: 'n', v: i + 1 };
    }
    if (widthCol) {
      const addr = columnToLetter(widthCol) + row;
      if (!ws[addr]?.f) ws[addr] = { t: 'n', v: Number(win.width) };
    }
    if (heightCol) {
      const addr = columnToLetter(heightCol) + row;
      if (!ws[addr]?.f) ws[addr] = { t: 'n', v: Number(win.height) };
    }
  });

  // Optional order number
  const orderNo = payload.orderNo || 'ORD-SIM';
  const orderCellMatch = findOrderNoCell(ws);
  if (orderCellMatch) {
    ws[orderCellMatch] = { t: 's', v: String(orderNo) };
  }

  // In-memory formula calculation across all sheets
  try {
    formula(wb);
  } catch (calcErr) {
    warnings.push(`Formula evaluation notice: ${calcErr.message}`);
  }

  // Read calculation grid
  const calcValues = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const grid = {
    startRow: 1,
    startCol: 1,
    values: calcValues
  };

  // Read material grid if material tab configured
  let materialGrid = null;
  const materialSheetName = gs.materialSheetName;
  if (materialSheetName && wb.Sheets[materialSheetName]) {
    const matValues = XLSX.utils.sheet_to_json(wb.Sheets[materialSheetName], { header: 1, defval: '' });
    materialGrid = {
      startRow: 1,
      startCol: 1,
      values: matValues
    };
  } else if (materialSheetName) {
    warnings.push(`Material tab "${materialSheetName}" not found in workbook.`);
  }

  // Fetch cached blueprint for UI rendering (if DB connected)
  let sheetBlueprint = null;
  let materialBlueprint = null;
  try {
    if (mongoose.connection?.readyState === 1) {
      const cachedStructure = await TemplateSheetStructure.findOne({ templateId: template._id }).lean();
      sheetBlueprint = cachedStructure?.blueprint || null;
      materialBlueprint = cachedStructure?.materialBlueprint || null;
    }
  } catch {}

  // Map BOM lists
  const mapped = mapMaterialGrid(materialGrid, gs.materialMapping || {}, { warnings });

  // Map Glass Panes from calculation sheet
  const glassList = gs.materialMapping?.glassBlock?.enabled
    ? mapGlassBlock(grid, gs.materialMapping.glassBlock)
    : [];

  const simulationData = (payload.lineItems || []).map((item, index) => ({
    windowNo: item?.windowNo || `Item ${index + 1}`,
    scope: {
      width: pickDimension(item?.measurements || {}, 'width'),
      height: pickDimension(item?.measurements || {}, 'height')
    },
    results: []
  }));

  const defaultPrintPages = gs.defaultPrintPages || template.defaultPrintPages || [];
  const durationMs = Date.now() - startTime;

  const resultData = {
    templateId: template._id,
    templateCode: template.code,
    templateName: template.name,
    defaultPrintPages,
    totalBomConsumption: mapped.totalBomConsumption,
    cuttingList: mapped.cuttingList,
    hardwareList: mapped.hardwareList,
    glassList,
    simulationData,
    warnings,
    sheetResult: {
      sheetName,
      sheet: sheetBlueprint,
      grid,
      materialSheetName: materialSheetName || null,
      materialSheet: materialBlueprint,
      materialGrid,
      inputColumnsUsed: {
        wNo: hints.wNoCol || columnToLetter(wNoCol),
        width: hints.widthCol || columnToLetter(widthCol),
        height: hints.heightCol || columnToLetter(heightCol),
        headerRow,
        dataStartRow,
        dataEndRow: effectiveDataEndRow
      },
      durationMs,
      defaultPrintPages,
      calculatedAt: new Date().toISOString()
    }
  };

  // Update template last calculated timestamp if DB connected
  if (mongoose.connection?.readyState === 1) {
    Template.updateOne(
      { _id: template._id },
      { $set: { 'googleSheet.lastCalculatedAt': new Date(), 'googleSheet.lastError': '' } }
    ).catch(() => {});
  }

  return resultData;
}

/**
 * Searches for an "Order No" label cell and returns the cell address to write the order number.
 */
function findOrderNoCell(ws) {
  let fallback = null;
  for (const addr in ws) {
    if (addr.startsWith('!')) continue;
    const cell = ws[addr];
    if (cell && typeof cell.v === 'string' && /order\s*no/i.test(cell.v)) {
      const decoded = XLSX.utils.decode_cell(addr);
      const targetAddr = XLSX.utils.encode_cell({ r: decoded.r, c: decoded.c + 1 });
      const targetCell = ws[targetAddr];
      // Do not write into a cell that already has a formula (e.g. =D1)
      if (targetCell?.f) {
        if (!fallback) fallback = targetAddr;
        continue;
      }
      return targetAddr;
    }
  }
  return fallback;
}
