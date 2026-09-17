import XLSX from 'xlsx';

const MAX_DATA_ROWS = 50;
const MATERIAL_NAME_RE = /material|hardware|hardwares|profile|consum/i;

/**
 * Converts a 1-based column number to Excel column letter (e.g. 1 -> A, 27 -> AA).
 */
export function columnToLetter(col) {
  let letter = '';
  while (col > 0) {
    const rem = (col - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    col = Math.floor((col - rem - 1) / 26);
  }
  return letter;
}

/**
 * Converts column letter to 1-based index (e.g. A -> 1, Z -> 26, AA -> 27).
 */
export function columnLetterToIndex(letter) {
  let index = 0;
  for (const ch of String(letter || '').toUpperCase()) {
    if (ch < 'A' || ch > 'Z') return 0;
    index = index * 26 + (ch.charCodeAt(0) - 64);
  }
  return index;
}

/**
 * Identifies input block (W.No, Width, Height) in a 2D sheet values array.
 * Exact algorithm from Code.gs to prevent multi-block tabs picking derived cut sizes.
 */
export function findInputColumns(values) {
  const rows = {};

  for (let r = 0; r < Math.min(values.length, 25); r++) {
    const row = values[r] || [];
    for (let c = 0; c < row.length; c++) {
      const raw = row[c];
      if (typeof raw !== 'string') continue;
      const label = raw.trim().toLowerCase();

      if (!rows[r]) {
        rows[r] = { wNoCol: null, widthCol: null, heightCol: null };
      }

      if (/^w\.?\s*no\.?$/i.test(label) || /^s\.?\s*no\.?$/i.test(label)) {
        if (rows[r].wNoCol === null) rows[r].wNoCol = c + 1;
      } else if (label.indexOf('width') !== -1) {
        if (rows[r].widthCol === null) rows[r].widthCol = c + 1;
      } else if (label.indexOf('height') !== -1) {
        if (rows[r].heightCol === null) rows[r].heightCol = c + 1;
      }
    }
  }

  let bestRowIdx = null;
  let bestScore = -1;

  Object.keys(rows).forEach(key => {
    const r = Number(key);
    const row = rows[r];
    if (!row.widthCol || !row.heightCol) return;
    const score = row.wNoCol ? 2 : 1;
    if (score > bestScore || (score === bestScore && r < bestRowIdx)) {
      bestScore = score;
      bestRowIdx = r;
    }
  });

  if (bestRowIdx === null) {
    return { wNoCol: null, widthCol: null, heightCol: null, headerRow: null };
  }

  return {
    wNoCol: rows[bestRowIdx].wNoCol,
    widthCol: rows[bestRowIdx].widthCol,
    heightCol: rows[bestRowIdx].heightCol,
    headerRow: bestRowIdx + 1
  };
}

/**
 * Finds where user input rows end before totals or formula rows.
 * Supports both (ws, values, cols, dataStartRow) and legacy (values, cols, dataStartRow).
 */
export function findDataEndRow(wsOrValues, colsOrValues, dataStartRowOrCols, legacyDataStartRow) {
  let ws = null;
  let values = null;
  let cols = null;
  let dataStartRow = null;

  if (Array.isArray(wsOrValues)) {
    // Legacy: findDataEndRow(values, cols, dataStartRow)
    values = wsOrValues;
    cols = colsOrValues;
    dataStartRow = dataStartRowOrCols;
  } else {
    // New: findDataEndRow(ws, values, cols, dataStartRow)
    ws = wsOrValues;
    values = colsOrValues;
    cols = dataStartRowOrCols;
    dataStartRow = legacyDataStartRow;
  }

  const colIndices = [cols?.wNoCol, cols?.widthCol, cols?.heightCol].filter(Boolean);
  const maxAvailable = (values?.length || 50) - dataStartRow + 1;
  const scanRows = Math.min(Math.max(maxAvailable, 1), MAX_DATA_ROWS);

  for (let i = 0; i < scanRows; i++) {
    const r = dataStartRow + i;

    // 1. Inspect worksheet cell formula properties
    if (ws) {
      for (const cIdx of colIndices) {
        const addr = columnToLetter(cIdx) + r;
        if (ws[addr]?.f) {
          return r - 1;
        }
      }
      for (let c = 1; c <= 4; c++) {
        const addr = columnToLetter(c) + r;
        const cell = ws[addr];
        if (cell?.f && /sum|count|average|subtotal/i.test(cell.f)) {
          return r - 1;
        }
      }
    }

    // 2. Inspect 2D values array for formula string or totals keywords
    if (values && values[r - 1]) {
      const row = values[r - 1];
      for (let c = 0; c < Math.min(row.length, 5); c++) {
        const val = String(row[c] || '').trim();
        if (/^(total|grand\s*total|sum|totals)$/i.test(val)) {
          return r - 1;
        }
        if (typeof val === 'string' && val.startsWith('=')) {
          return r - 1;
        }
      }
    }
  }

  return dataStartRow + 9;
}

/**
 * Parses an Excel workbook buffer or file into blueprint objects matching
 * the TemplateSheetStructure format used throughout Aran v2.
 */
export function parseExcelWorkbook(bufferOrPath, options = {}) {
  const readOpts = {
    cellFormula: true,
    cellStyles: true,
    cellDates: true,
    sheetStubs: true,
    ...options
  };

  const wb = typeof bufferOrPath === 'string'
    ? XLSX.readFile(bufferOrPath, readOpts)
    : XLSX.read(bufferOrPath, { type: 'buffer', ...readOpts });

  const sheetsResult = {};

  wb.SheetNames.forEach(sheetName => {
    const ws = wb.Sheets[sheetName];
    if (!ws || !ws['!ref']) {
      sheetsResult[sheetName] = {
        dimensions: 'A1:A1',
        max_row: 0,
        max_col: 0,
        merged_ranges: [],
        input_field_hints: null,
        cells: {}
      };
      return;
    }

    const range = XLSX.utils.decode_range(ws['!ref']);
    const maxRow = range.e.r + 1;
    const maxCol = range.e.c + 1;

    // Build 2D values array (header: 1, defval: '')
    const values2D = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    while (values2D.length < maxRow) values2D.push([]);
    values2D.forEach(row => {
      while (row.length < maxCol) row.push('');
    });

    // Merged ranges
    const mergedRangesList = (ws['!merges'] || []).map(m => XLSX.utils.encode_range(m));
    const mergeLookup = {};
    const anchorSet = {};

    (ws['!merges'] || []).forEach(m => {
      const rangeStr = XLSX.utils.encode_range(m);
      anchorSet[`${m.s.r + 1},${m.s.c + 1}`] = true;
      for (let r = m.s.r; r <= m.e.r; r++) {
        for (let c = m.s.c; c <= m.e.c; c++) {
          mergeLookup[`${r + 1},${c + 1}`] = rangeStr;
        }
      }
    });

    const cells = {};
    for (let r = 0; r < maxRow; r++) {
      for (let c = 0; c < maxCol; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        const key = `${r + 1},${c + 1}`;
        const isMerged = mergeLookup.hasOwnProperty(key);

        const rawVal = cell ? cell.v : values2D[r][c];
        const rawFormula = cell && cell.f ? `=${cell.f}` : '';

        if ((rawVal === '' || rawVal === null || rawVal === undefined) && !rawFormula && !isMerged) {
          continue;
        }

        const isFormula = Boolean(rawFormula);
        cells[addr] = {
          value: isFormula ? (rawVal !== undefined && rawVal !== '' ? rawVal : null) : (rawVal === '' ? null : rawVal),
          formula: isFormula ? rawFormula : null,
          is_formula: isFormula,
          is_merge_anchor: !!anchorSet[key],
          merged_into: mergeLookup[key] || null,
          number_format: cell?.z || null,
          font: {
            bold: Boolean(cell?.s?.font?.bold),
            size: cell?.s?.font?.sz || 11,
            color: cell?.s?.font?.color?.rgb ? `#${cell.s.font.color.rgb}` : null
          },
          fill: cell?.s?.fill?.fgColor?.rgb ? `#${cell.s.fill.fgColor.rgb}` : null,
          row: r + 1,
          col: c + 1
        };
      }
    }

    const cols = findInputColumns(values2D);
    let hints = {
      w_no_col: null, width_col: null, height_col: null, header_row: null, data_start_row: null, data_end_row: null,
      wNoCol: null, widthCol: null, heightCol: null, headerRow: null, dataStartRow: null, dataEndRow: null
    };
    if (cols.widthCol && cols.heightCol) {
      const dataStartRow = cols.headerRow + 1;
      const dataEndRow = findDataEndRow(ws, values2D, cols, dataStartRow);
      const wNoColLetter = cols.wNoCol ? columnToLetter(cols.wNoCol) : null;
      const widthColLetter = columnToLetter(cols.widthCol);
      const heightColLetter = columnToLetter(cols.heightCol);

      hints = {
        w_no_col: wNoColLetter,
        width_col: widthColLetter,
        height_col: heightColLetter,
        header_row: cols.headerRow,
        data_start_row: dataStartRow,
        data_end_row: dataEndRow,
        // CamelCase aliases for direct Mongoose document compatibility
        wNoCol: wNoColLetter,
        widthCol: widthColLetter,
        heightCol: heightColLetter,
        headerRow: cols.headerRow,
        dataStartRow: dataStartRow,
        dataEndRow: dataEndRow
      };
    }

    sheetsResult[sheetName] = {
      dimensions: ws['!ref'],
      max_row: maxRow,
      max_col: maxCol,
      merged_ranges: mergedRangesList,
      input_field_hints: hints.width_col && hints.height_col ? hints : null,
      cells
    };
  });

  return {
    sheetNames: wb.SheetNames,
    sheets: sheetsResult
  };
}

/**
 * Tab summary for modal selection.
 */
export function summarizeExcelTabs(sheets) {
  const tabs = Object.entries(sheets || {}).map(([name, sheet]) => {
    const hints = sheet?.input_field_hints || null;
    const calculable = Boolean(hints && hints.width_col && hints.height_col);
    return {
      name,
      calculable,
      maxRow: sheet?.max_row ?? 0,
      maxCol: sheet?.max_col ?? 0,
      cellCount: sheet?.cells ? Object.keys(sheet.cells).length : 0,
      mergedCount: Array.isArray(sheet?.merged_ranges) ? sheet.merged_ranges.length : 0,
      isMaterialCandidate: !calculable && MATERIAL_NAME_RE.test(name),
      inputHints: calculable ? hints : null,
      warning: null
    };
  });

  tabs.sort((a, b) => (b.calculable - a.calculable) || a.name.localeCompare(b.name));

  const firstCalculable = tabs.find(t => t.calculable);
  const firstMaterial = tabs.find(t => t.isMaterialCandidate);

  return {
    tabs,
    suggested: {
      sheetName: firstCalculable?.name || tabs[0]?.name || '',
      materialSheetName: firstMaterial?.name || ''
    }
  };
}
