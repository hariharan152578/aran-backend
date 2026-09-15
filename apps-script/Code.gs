/**
 * Aran v2 — Production Sheet Webhook
 *
 * Universal Webhook for ALL production templates including:
 *   - "SL-SL-Mesh(Small Sash)" (SL-SL-SL-SL 2.5T,4s MESH Breeze Big sash)
 *   - "OP-OP-OP-OP" (OP-OP-OP-OP V.Cutting Breeze Production)
 *   - Fixed, Louver, Breeze, Sliding, Casement, and Custom Workbooks
 *
 * Deploy: Extensions > Apps Script > Deploy > New deployment (or Manage deployments > New version)
 *   - Type: Web app
 *   - Execute as: Me
 *   - Who has access: Anyone
 *
 * Expected POST body (JSON):
 * {
 *   "sheetName": "SL-SL-Mesh(Small Sash)",        // which tab to write into
 *   "orderNo": "ORD-1024",                       // optional
 *   "materialSheetName": "Profile & Hardwares",  // optional (auto-discovered if omitted)
 *   "windows": [
 *     { "width": 1200, "height": 900 },
 *     { "width": 1500, "height": 1000 }
 *   ]
 * }
 *
 * GET endpoints:
 *   ?action=structure            → returns ALL tabs (auto-discovery)
 *   ?action=structure&sheet=FIX  → returns only the named tab
 *
 * Response (POST):
 * {
 *   "sheetName": "SL-SL-Mesh(Small Sash)",
 *   "grid": { "startRow": 1, "startCol": 1, "values": [[...],[...], ...] },
 *   "materialSheetName": "Profile & Hardwares",
 *   "materialGrid": { "startRow": 1, "startCol": 1, "values": [[...]] }
 * }
 */

const DEFAULT_MATERIAL_SHEET_NAME = "Profile & Hardwares";
const MAX_DATA_ROWS = 50;
const LOCK_TIMEOUT_MS = 60000;

function doPost(e) {
  let sheet = null;
  let insertedAt = 0;
  let insertedRows = 0;

  // Serialise the write -> flush -> read -> wipe cycle to prevent concurrency issues
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(LOCK_TIMEOUT_MS);
  } catch (lockErr) {
    return jsonResponse({
      error: "The spreadsheet is busy with another calculation. Please retry in a moment."
    });
  }

  try {
    const body = JSON.parse(e.postData.contents);
    const sheetName = body.sheetName;
    const windows = body.windows || [];

    if (!sheetName) {
      return jsonResponse({ error: "sheetName is required in the request body." });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      return jsonResponse({ error: `No sheet named "${sheetName}" found in this workbook.` });
    }

    const cols = findInputColumns(sheet);
    if (!cols.widthCol || !cols.heightCol) {
      return jsonResponse({
        error: `Could not find input "Width" and "Height" headers on sheet "${sheetName}". Found: ${JSON.stringify(cols)}`
      });
    }

    const dataStartRow = cols.headerRow + 1;
    let dataEndRow = findDataEndRow(sheet, cols, dataStartRow);
    let maxRows = dataEndRow - dataStartRow + 1;

    // Dynamically expand data block if order has more windows than default template slots
    if (windows.length > maxRows) {
      insertedRows = windows.length - maxRows;
      insertedAt = dataEndRow;
      sheet.insertRowsBefore(insertedAt, insertedRows);
      dataEndRow += insertedRows;
      maxRows = windows.length;
      SpreadsheetApp.flush();
    }

    // Clear only genuine input columns (W.No, Width, Height)
    const inputCols = [cols.wNoCol, cols.widthCol, cols.heightCol].filter(Boolean);
    inputCols.forEach(col => {
      sheet.getRange(dataStartRow, col, maxRows, 1).clearContent();
    });

    // Write input values
    if (windows.length > 0) {
      if (cols.wNoCol) {
        sheet.getRange(dataStartRow, cols.wNoCol, windows.length, 1)
          .setValues(windows.map((_, i) => [i + 1]));
      }
      sheet.getRange(dataStartRow, cols.widthCol, windows.length, 1)
        .setValues(windows.map(win => [win.width]));
      sheet.getRange(dataStartRow, cols.heightCol, windows.length, 1)
        .setValues(windows.map(win => [win.height]));
    }

    // Write optional order number to the master input cell
    let orderCellRange = null;
    if (body.orderNo) {
      const orderCell = findLabelValueCell(sheet, /order\s*no/i);
      if (orderCell) {
        orderCellRange = sheet.getRange(orderCell);
        orderCellRange.setValue(body.orderNo);
      }
    }

    SpreadsheetApp.flush();

    const grid = readEntireSheet(sheet);
    const response = {
      sheetName: sheetName,
      inputColumnsUsed: {
        wNo: cols.wNoCol ? columnToLetter(cols.wNoCol) : null,
        width: columnToLetter(cols.widthCol),
        height: columnToLetter(cols.heightCol),
        headerRow: cols.headerRow,
        dataStartRow: dataStartRow,
        dataEndRow: dataEndRow
      },
      grid: grid
    };

    // If rows were temporarily inserted, capture the expanded layout
    if (insertedRows > 0) {
      const expanded = getStructure(sheetName);
      if (expanded.sheets && expanded.sheets[sheetName]) {
        response.expandedSheet = expanded.sheets[sheetName];
      }
    }

    // Dynamic material / hardware sheet lookup
    const materialSheet = findMaterialSheet(ss, body.materialSheetName);
    if (materialSheet) {
      response.materialSheetName = materialSheet.getName();
      response.materialGrid = readEntireSheet(materialSheet);
    }

    // Clean up written values so sheet remains a clean template
    inputCols.forEach(col => {
      sheet.getRange(dataStartRow, col, maxRows, 1).clearContent();
    });
    if (orderCellRange) {
      orderCellRange.clearContent();
    }
    SpreadsheetApp.flush();

    return jsonResponse(response);

  } catch (err) {
    return jsonResponse({ error: err.message, stack: err.stack });
  } finally {
    // Revert inserted rows
    if (sheet && insertedRows > 0) {
      try {
        sheet.deleteRows(insertedAt, insertedRows);
        SpreadsheetApp.flush();
      } catch (cleanupErr) {
        console.error("Failed to remove temporary rows: " + cleanupErr.message);
      }
    }
    lock.releaseLock();
  }
}

/**
 * Intelligent material tab discovery.
 * Checks requested name, then known aliases, then regex matches.
 */
function findMaterialSheet(ss, requestedName) {
  if (requestedName) {
    const s = ss.getSheetByName(requestedName);
    if (s) return s;
  }
  const aliases = [
    DEFAULT_MATERIAL_SHEET_NAME,
    "Material & Hardware",
    "Profile & Hardware",
    "Profile & Hardwares",
    "Hardware",
    "Material",
    "Materials"
  ];
  for (let i = 0; i < aliases.length; i++) {
    const s = ss.getSheetByName(aliases[i]);
    if (s) return s;
  }
  const allSheets = ss.getSheets();
  for (let i = 0; i < allSheets.length; i++) {
    const name = allSheets[i].getName().trim().toLowerCase();
    if (/material|hardware|profile\s*&/i.test(name)) {
      return allSheets[i];
    }
  }
  return null;
}

/**
 * Identifies the exact input block (W.No, Width, Height)
 * Scans row-by-row, preferring rows containing W.No and leftmost Width/Height columns.
 * Prevents calculated columns (e.g. Shutter Width, Mesh Width, Fram Width) from overwriting inputs.
 */
function findInputColumns(sheet) {
  const values = sheet.getDataRange().getValues();
  const rows = {};

  for (let r = 0; r < Math.min(values.length, 25); r++) {
    for (let c = 0; c < values[r].length; c++) {
      const raw = values[r][c];
      if (typeof raw !== "string") continue;
      const label = raw.trim().toLowerCase();

      if (!rows[r]) {
        rows[r] = { wNoCol: null, widthCol: null, heightCol: null };
      }

      if (/^w\.?\s*no\.?$/i.test(label) || /^s\.?\s*no\.?$/i.test(label)) {
        if (rows[r].wNoCol === null) rows[r].wNoCol = c + 1;
      } else if (label.indexOf("width") !== -1) {
        // Keep the leftmost width column in this row (e.g. Width(mm))
        if (rows[r].widthCol === null) rows[r].widthCol = c + 1;
      } else if (label.indexOf("height") !== -1) {
        // Keep the leftmost height column in this row (e.g. Height(mm))
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

  const best = rows[bestRowIdx];
  return {
    wNoCol: best.wNoCol,
    widthCol: best.widthCol,
    heightCol: best.heightCol,
    headerRow: bestRowIdx + 1
  };
}

/**
 * Finds the end of the user input data range before the totals / formula row.
 */
function findDataEndRow(sheet, cols, dataStartRow) {
  const col = cols.wNoCol || cols.widthCol;
  const available = sheet.getMaxRows() - dataStartRow + 1;
  if (available < 1) return dataStartRow;
  const scanRows = Math.min(available, MAX_DATA_ROWS);
  const formulas = sheet.getRange(dataStartRow, col, scanRows, 1).getFormulas();

  for (let i = 0; i < formulas.length; i++) {
    if (formulas[i][0] && formulas[i][0].toString().indexOf("=") === 0) {
      return dataStartRow + i - 1;
    }
  }
  return dataStartRow + 10; // Default 11 rows (6 to 16) fallback
}

/**
 * Locates the master writable cell next to an "Order No" label,
 * taking merged cells and formula references into account.
 */
function findLabelValueCell(sheet, labelRegex) {
  const fullRange = sheet.getDataRange();
  const values = fullRange.getValues();
  const formulas = fullRange.getFormulas();
  const mergedRanges = fullRange.getMergedRanges();

  for (let r = 0; r < Math.min(values.length, 10); r++) {
    for (let c = 0; c < values[r].length; c++) {
      const raw = values[r][c];
      if (typeof raw === "string" && labelRegex.test(raw)) {
        let targetCol = c + 2; // Default: 1 column to the right

        // If the label is part of a merged range, jump past the merged boundary
        for (let m = 0; m < mergedRanges.length; m++) {
          const mr = mergedRanges[m];
          if (r + 1 >= mr.getRow() && r + 1 <= mr.getLastRow() &&
              c + 1 >= mr.getColumn() && c + 1 <= mr.getLastColumn()) {
            targetCol = mr.getLastColumn() + 1;
            break;
          }
        }

        // Avoid writing into cells that contain formulas (e.g. =F1, =E1 or =M1)
        if (targetCol <= sheet.getMaxColumns()) {
          const cellFormula = (formulas[r] && formulas[r][targetCol - 1]) || "";
          if (cellFormula === "") {
            return sheet.getRange(r + 1, targetCol).getA1Notation();
          }
        }
      }
    }
  }
  return null;
}

function readEntireSheet(sheet) {
  const range = sheet.getDataRange();
  return {
    startRow: range.getRow(),
    startCol: range.getColumn(),
    values: range.getValues()
  };
}

function columnToLetter(col) {
  let letter = "";
  while (col > 0) {
    const rem = (col - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    col = Math.floor((col - rem - 1) / 26);
  }
  return letter;
}

function doGet(e) {
  const params = (e && e.parameter) || {};

  if (params.action === "structure") {
    return jsonResponse(getStructure(params.sheet || null));
  }

  return jsonResponse({
    status: "Webhook is live.",
    usage: {
      submitOrder: "POST { sheetName, orderNo, materialSheetName, windows: [{width,height}] }",
      getStructureAll: "GET ?action=structure",
      getStructureOne: "GET ?action=structure&sheet=SheetName"
    }
  });
}

function getStructure(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheetsToProcess = sheetName ? [ss.getSheetByName(sheetName)].filter(Boolean) : ss.getSheets();

  const sheetsResult = {};

  sheetsToProcess.forEach(sheet => {
    const name = sheet.getName();
    const fullRange = sheet.getDataRange();
    const maxRow = fullRange.getLastRow();
    const maxCol = fullRange.getLastColumn();

    const values = fullRange.getValues();
    const formulas = fullRange.getFormulas();
    const fontWeights = fullRange.getFontWeights();
    const fontColors = fullRange.getFontColors();
    const fontSizes = fullRange.getFontSizes();
    const backgrounds = fullRange.getBackgrounds();
    const numberFormats = fullRange.getNumberFormats();

    const mergedRangesList = fullRange.getMergedRanges();
    const mergeLookup = {};
    const anchorSet = {};

    mergedRangesList.forEach(mr => {
      const r1 = mr.getRow(), c1 = mr.getColumn();
      const r2 = mr.getLastRow(), c2 = mr.getLastColumn();
      const rangeStr = mr.getA1Notation();
      anchorSet[`${r1},${c1}`] = true;
      for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) {
          mergeLookup[`${r},${c}`] = rangeStr;
        }
      }
    });

    const cells = {};
    for (let r = 0; r < maxRow; r++) {
      for (let c = 0; c < maxCol; c++) {
        const val = values[r][c];
        const formula = formulas[r][c];
        const key = `${r + 1},${c + 1}`;
        const isMerged = mergeLookup.hasOwnProperty(key);

        if ((val === "" || val === null) && formula === "" && !isMerged) continue;

        const isFormula = formula !== "";
        const addr = sheet.getRange(r + 1, c + 1).getA1Notation();

        cells[addr] = {
          value: isFormula ? null : (val === "" ? null : val),
          formula: isFormula ? formula : null,
          is_formula: isFormula,
          is_merge_anchor: !!anchorSet[key],
          merged_into: mergeLookup[key] || null,
          number_format: numberFormats[r][c],
          font: {
            bold: fontWeights[r][c] === "bold",
            size: fontSizes[r][c],
            color: fontColors[r][c] || null
          },
          fill: backgrounds[r][c] && backgrounds[r][c] !== "#ffffff" ? backgrounds[r][c] : null,
          row: r + 1,
          col: c + 1
        };
      }
    }

    const cols = findInputColumns(sheet);
    let hints = { w_no_col: null, width_col: null, height_col: null, header_row: null, data_start_row: null, data_end_row: null };
    if (cols.widthCol && cols.heightCol) {
      const dataStartRow = cols.headerRow + 1;
      const dataEndRow = findDataEndRow(sheet, cols, dataStartRow);
      hints = {
        w_no_col: cols.wNoCol ? columnToLetter(cols.wNoCol) : null,
        width_col: columnToLetter(cols.widthCol),
        height_col: columnToLetter(cols.heightCol),
        header_row: cols.headerRow,
        data_start_row: dataStartRow,
        data_end_row: dataEndRow
      };
    }

    sheetsResult[name] = {
      dimensions: fullRange.getA1Notation(),
      max_row: maxRow,
      max_col: maxCol,
      merged_ranges: mergedRangesList.map(mr => mr.getA1Notation()),
      input_field_hints: hints,
      cells: cells
    };
  });

  return { sheets: sheetsResult };
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
