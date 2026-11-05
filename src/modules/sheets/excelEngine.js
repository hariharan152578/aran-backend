import os from 'node:os';
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
export const FALLBACK_STORAGE_DIR = path.resolve(os.tmpdir(), 'aran-uploads/templates');

export function ensureDirectory(dir) {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o777 });
    }
    return true;
  } catch (err) {
    console.warn(`[ExcelEngine] Directory warning for ${dir}:`, err.message);
    return false;
  }
}

// Ensure base directories
ensureDirectory(TEMPLATE_STORAGE_DIR);

/**
 * Persists an Excel workbook buffer to disk safely, with fallback directories and base64.
 * Returns { filePath, base64Data }
 */
export function persistTemplateWorkbook(templateId, buffer) {
  const fileName = `${templateId}.xlsx`;
  const base64Data = buffer ? buffer.toString('base64') : '';

  // 1. Try standard directory (uploads/templates)
  try {
    ensureDirectory(TEMPLATE_STORAGE_DIR);
    const targetPath = path.join(TEMPLATE_STORAGE_DIR, fileName);
    fs.writeFileSync(targetPath, buffer);
    return { filePath: `uploads/templates/${fileName}`, base64Data };
  } catch (err) {
    console.warn(`[ExcelEngine] Standard storage write failed for ${fileName} (${err.message}). Trying fallback temp directory...`);
  }

  // 2. Fallback to OS temp directory
  try {
    ensureDirectory(FALLBACK_STORAGE_DIR);
    const fallbackPath = path.join(FALLBACK_STORAGE_DIR, fileName);
    fs.writeFileSync(fallbackPath, buffer);
    console.info(`[ExcelEngine] Successfully stored ${fileName} in fallback location: ${fallbackPath}`);
    return { filePath: fallbackPath, base64Data };
  } catch (fallbackErr) {
    console.warn(`[ExcelEngine] Fallback storage write also failed (${fallbackErr.message}). Relying on base64 database backup.`);
  }

  return { filePath: '', base64Data };
}

/**
 * Retrieves the raw workbook Buffer for a template.
 * Checks disk path first, fallback locations, and base64Data stored in MongoDB.
 */
export async function getTemplateBuffer(template) {
  // 1. Check direct filePath on disk
  if (template?.excelWorkbook?.filePath) {
    const directPath = path.isAbsolute(template.excelWorkbook.filePath)
      ? template.excelWorkbook.filePath
      : path.resolve(process.cwd(), template.excelWorkbook.filePath);
    if (fs.existsSync(directPath)) {
      try {
        return fs.readFileSync(directPath);
      } catch (e) {
        console.warn(`[ExcelEngine] Error reading disk path ${directPath}:`, e.message);
      }
    }
  }

  // 2. Check standard directory by template ID
  const idStr = String(template?._id || template?.id || '');
  if (idStr) {
    const standardPath = path.join(TEMPLATE_STORAGE_DIR, `${idStr}.xlsx`);
    if (fs.existsSync(standardPath)) {
      try {
        return fs.readFileSync(standardPath);
      } catch (e) {}
    }

    // Check fallback temp directory
    const fallbackPath = path.join(FALLBACK_STORAGE_DIR, `${idStr}.xlsx`);
    if (fs.existsSync(fallbackPath)) {
      try {
        return fs.readFileSync(fallbackPath);
      } catch (e) {}
    }
  }

  // 3. Check by code
  if (template?.code) {
    const codePath = path.join(TEMPLATE_STORAGE_DIR, `${template.code}.xlsx`);
    if (fs.existsSync(codePath)) {
      try {
        return fs.readFileSync(codePath);
      } catch (e) {}
    }
  }

  // 4. Retrieve from base64Data in MongoDB
  if (template?.excelWorkbook?.base64Data) {
    const buf = Buffer.from(template.excelWorkbook.base64Data, 'base64');
    // Passively attempt to cache to disk if writable
    try {
      if (idStr) {
        const destDir = ensureDirectory(TEMPLATE_STORAGE_DIR) ? TEMPLATE_STORAGE_DIR : FALLBACK_STORAGE_DIR;
        ensureDirectory(destDir);
        fs.writeFileSync(path.join(destDir, `${idStr}.xlsx`), buf);
      }
    } catch (e) {}
    return buf;
  }

  // 5. Fallback search in TEMPLATE_STORAGE_DIR (e.g. after mongorestore when ObjectId changed)
  try {
    if (fs.existsSync(TEMPLATE_STORAGE_DIR)) {
      const files = fs.readdirSync(TEMPLATE_STORAGE_DIR).filter(f => f.endsWith('.xlsx'));
      const targetSheet = template?.googleSheet?.sheetName;
      for (const f of files) {
        const full = path.join(TEMPLATE_STORAGE_DIR, f);
        try {
          const stat = fs.statSync(full);
          if (template?.excelWorkbook?.fileSize && stat.size === template.excelWorkbook.fileSize) {
            const buf = fs.readFileSync(full);
            if (idStr) {
              try { fs.writeFileSync(path.join(TEMPLATE_STORAGE_DIR, `${idStr}.xlsx`), buf); } catch {}
            }
            return buf;
          }
          if (targetSheet) {
            const probeWb = XLSX.readFile(full, { bookSheets: true });
            if (probeWb.SheetNames?.includes(targetSheet)) {
              const buf = fs.readFileSync(full);
              if (idStr) {
                try { fs.writeFileSync(path.join(TEMPLATE_STORAGE_DIR, `${idStr}.xlsx`), buf); } catch {}
              }
              return buf;
            }
          }
        } catch {}
      }
    }
  } catch {}

  throw Object.assign(
    new Error(`Excel workbook file not found for template "${template?.name || 'Untitled'}". Please edit the template and re-upload the .xlsx file.`),
    { status: 404 }
  );
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

  const fileBuffer = await getTemplateBuffer(template);
  const startTime = Date.now();

  // Read workbook fresh into memory so calculations never mutate the master template file
  const wb = XLSX.read(fileBuffer, {
    type: 'buffer',
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

  // Optional order date
  const rawDate = payload.orderDate || payload.date;
  const dateStr = rawDate
    ? (typeof rawDate === 'string' && rawDate.includes('T') ? rawDate.split('T')[0] : String(rawDate))
    : new Date().toISOString().split('T')[0];

  const orderNo = payload.orderNo || 'ORD-SIM';

  // Inject date and order number across all matching header cells in calculation sheet
  injectDateCells(ws, dateStr);
  injectOrderNoCells(ws, String(orderNo));

  // Also inject on material sheet if present
  const materialSheetName = gs.materialSheetName;
  if (materialSheetName && wb.Sheets[materialSheetName]) {
    injectDateCells(wb.Sheets[materialSheetName], dateStr);
    injectOrderNoCells(wb.Sheets[materialSheetName], String(orderNo));
  }

  // In-memory formula calculation across all sheets
  try {
    formula(wb);
  } catch (calcErr) {
    warnings.push(`Formula evaluation notice: ${calcErr.message}`);
  }

  // Finalize header cells (ensures any formula cell next to DATE or ORDER NO that evaluated to empty/0 receives the actual value)
  finalizeHeaderCells(ws, dateStr, String(orderNo));
  if (materialSheetName && wb.Sheets[materialSheetName]) {
    finalizeHeaderCells(wb.Sheets[materialSheetName], dateStr, String(orderNo));
  }

  // Sanitize formula outputs (xlsx-calc leaves t=undefined or v as Date object)
  for (const addr in ws) {
    if (addr.startsWith('!')) continue;
    const cell = ws[addr];
    if (cell) {
      if (cell.v instanceof Date) {
        cell.t = 's';
        cell.v = cell.v.toISOString().split('T')[0];
        cell.w = cell.v;
      } else if (cell.t === undefined && cell.v !== undefined && cell.v !== null) {
        cell.t = typeof cell.v === 'number' ? 'n' : 's';
        if (typeof cell.v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(cell.v)) {
          cell.v = cell.v.split('T')[0];
          cell.w = cell.v;
        }
      }
    }
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
 * Searches for a "Date" label cell or TODAY() formula cell and returns the cell address to write the order date.
 */
function findDateCell(ws) {
  // 1. Look for a cell whose formula is TODAY()
  for (const addr in ws) {
    if (addr.startsWith('!')) continue;
    const cell = ws[addr];
    if (cell && typeof cell.f === 'string' && /^today\(\s*\)$/i.test(cell.f.trim())) {
      return addr;
    }
  }

  // 2. Look for a cell whose value is "DATE" or "ORDER DATE" and pick adjacent cell (col + 1)
  let fallback = null;
  for (const addr in ws) {
    if (addr.startsWith('!')) continue;
    const cell = ws[addr];
    if (cell && typeof cell.v === 'string' && /(^|[\s_])date([\s_:]|$)/i.test(cell.v.trim())) {
      const decoded = XLSX.utils.decode_cell(addr);
      const targetAddr = XLSX.utils.encode_cell({ r: decoded.r, c: decoded.c + 1 });
      const targetCell = ws[targetAddr];
      if (!targetCell?.f || /^today\(\s*\)$/i.test(targetCell.f.trim())) {
        return targetAddr;
      }
      if (!fallback) fallback = targetAddr;
    }
  }
  return fallback;
}

/**
 * Injects order date into all cells adjacent to "DATE" labels across a worksheet.
 * Respects merged label cells by finding the cell immediately to the right of the merge range.
 */
function injectDateCells(ws, dateStr) {
  if (!dateStr || !ws) return;
  const dateRegex = /(^|[\s_])date([\s_:]|$)/i;
  const merges = ws['!merges'] || [];

  for (const addr in ws) {
    if (addr.startsWith('!')) continue;
    const cell = ws[addr];
    if (cell && typeof cell.v === 'string' && dateRegex.test(cell.v.trim())) {
      const decoded = XLSX.utils.decode_cell(addr);
      const merge = merges.find(m => m.s.r === decoded.r && m.s.c === decoded.c);
      const targetCol = merge ? (merge.e.c + 1) : (decoded.c + 1);
      const targetAddr = XLSX.utils.encode_cell({ r: decoded.r, c: targetCol });
      const targetCell = ws[targetAddr];

      if (!targetCell || !targetCell.f || /^=?today\(\s*\)$/i.test(targetCell.f.trim())) {
        ws[targetAddr] = { t: 's', v: String(dateStr), w: String(dateStr) };
      }
    }
  }
}

/**
 * Injects order number into all cells adjacent to "ORDER NO" labels across a worksheet.
 * Respects merged label cells by finding the cell immediately to the right of the merge range.
 */
function injectOrderNoCells(ws, orderNo) {
  if (!orderNo || !ws) return;
  const orderRegex = /(^|[\s_])order\s*(no|num|number|#)([\s_:]|$)/i;
  const merges = ws['!merges'] || [];

  for (const addr in ws) {
    if (addr.startsWith('!')) continue;
    const cell = ws[addr];
    if (cell && typeof cell.v === 'string' && orderRegex.test(cell.v.trim())) {
      const decoded = XLSX.utils.decode_cell(addr);
      const merge = merges.find(m => m.s.r === decoded.r && m.s.c === decoded.c);
      const targetCol = merge ? (merge.e.c + 1) : (decoded.c + 1);
      const targetAddr = XLSX.utils.encode_cell({ r: decoded.r, c: targetCol });
      const targetCell = ws[targetAddr];

      // If target cell does not have a formula, write orderNo directly
      if (!targetCell || !targetCell.f) {
        ws[targetAddr] = { t: 's', v: String(orderNo), w: String(orderNo) };
      }
    }
  }
}

/**
 * Post-formula sweep: ensures any cell next to DATE or ORDER NO that evaluated to empty, '0', 0, or null
 * receives the actual date or order number.
 */
function finalizeHeaderCells(ws, dateStr, orderNo) {
  if (!ws) return;
  const dateRegex = /(^|[\s_])date([\s_:]|$)/i;
  const orderRegex = /(^|[\s_])order\s*(no|num|number|#)([\s_:]|$)/i;
  const merges = ws['!merges'] || [];

  for (const addr in ws) {
    if (addr.startsWith('!')) continue;
    const cell = ws[addr];
    if (!cell || typeof cell.v !== 'string') continue;
    const text = cell.v.trim();

    if (dateStr && dateRegex.test(text)) {
      const decoded = XLSX.utils.decode_cell(addr);
      const merge = merges.find(m => m.s.r === decoded.r && m.s.c === decoded.c);
      const targetCol = merge ? (merge.e.c + 1) : (decoded.c + 1);
      const targetAddr = XLSX.utils.encode_cell({ r: decoded.r, c: targetCol });
      const target = ws[targetAddr];
      if (!target || target.v === '' || target.v === 0 || target.v === '0' || target.v === null || target.v === undefined) {
        ws[targetAddr] = { t: 's', v: String(dateStr), w: String(dateStr) };
      }
    }

    if (orderNo && orderRegex.test(text)) {
      const decoded = XLSX.utils.decode_cell(addr);
      const merge = merges.find(m => m.s.r === decoded.r && m.s.c === decoded.c);
      const targetCol = merge ? (merge.e.c + 1) : (decoded.c + 1);
      const targetAddr = XLSX.utils.encode_cell({ r: decoded.r, c: targetCol });
      const target = ws[targetAddr];
      if (!target || target.v === '' || target.v === 0 || target.v === '0' || target.v === null || target.v === undefined) {
        ws[targetAddr] = { t: 's', v: String(orderNo), w: String(orderNo) };
      }
    }
  }
}
