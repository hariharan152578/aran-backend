/**
 * Turns a material tab's raw value grid into the structured BOM lists that
 * ProductionCard, dispatch and the reports modules already consume:
 * totalBomConsumption / cuttingList / hardwareList / glassList.
 *
 * WHAT THE REAL DATA LOOKS LIKE
 * Two shapes were sampled from production workbooks.
 *
 * "Material & Hardware" (26 rows x 3 cols) - one block:
 *   r1  "Material Consumed for this order"
 *   r2  "EITI"
 *   r3  "S.No" | "Description" | <order no>      <- header row
 *   r4   1     | "60 Casement Fram" | ""
 *   r5   2     | "60 Small Casment Fram" | 0.8   <- only a couple carry a value
 *
 * "Profile & Hardwares" (27 rows x 9 cols) - THREE blocks, two side by side:
 *   r2  "Profile Consumed for this order"  |  "Steel Consumed for this order"
 *   r3  "EITI-(OP/OP)"                     |  "EITI-(OP/OP)"
 *   r4  "S.No"|"Description"|<order no>     |  "S.no"|"Description"|<order no>
 *   r11                                    |  "HARDWARE"
 *   r12                                    |  "EITI-(OP/OP)" | "Order no"
 *   r13                                    |  "S.no"|"Description"|<order no>
 *
 * Four facts drive every decision below:
 *
 *  1. A block is the triple S.No | Description | value, repeated horizontally
 *     AND vertically. "S.no" also appears lower-case.
 *
 *  2. The value column's HEADER IS NOT "Qty" - it holds the order number
 *     (=OP-OP!D1). Header-text matching cannot find it, so it is located by
 *     position and data type.
 *
 *  3. Most rows are blank. 21 of 23 profile rows have no value: the tab is a
 *     master catalogue, and only the rows this order consumes get filled in.
 *     Emitting the blanks would flood the BOM with zero-quantity noise.
 *
 *  4. The category comes from a section title ABOVE the header - but NOT from
 *     the row immediately above it. Above the HARDWARE block's header sits
 *     "EITI-(OP/OP)", a customer/config marker; "HARDWARE" is two rows further
 *     up. Taking the nearest non-empty string would file hardware as profiles
 *     and push handles and locks into the cutting list. So the search scans
 *     upwards for a row that actually matches a known category instead.
 */

/** How far below a header row to look for the data block's end. */
const MAX_BLOCK_ROWS = 200;
/** How far above a header row to look for its section title. */
const TITLE_LOOKUP_ROWS = 4;
/** How far right of Description to look for the quantity column. */
const QTY_SEARCH_WIDTH = 4;

const SNO_RE = /^s\.?\s*no\.?$/i;
const DESC_RE = /desc/i;
const TOTAL_RE = /^\s*total\s*$/i;

/**
 * Section-title patterns, most specific first. `unit` is the default for the
 * block; individual rows can override it (see unitForItem).
 */
const CATEGORY_RULES = [
  { re: /hardware|handel|handle|lock|hinge|stay|espage|roller|bearing/i,
    category: 'Hardware', group: 'Hardware', unit: 'Nos' },
  { re: /steel|reinforce|galvani/i,
    category: 'Profiles', group: 'Steel', unit: 'bars' },
  { re: /glass|glazing\s*unit/i,
    category: 'Glass', group: 'Glass', unit: 'sqft' },
  { re: /profile|material|consum/i,
    category: 'Profiles', group: 'Profiles', unit: 'bars' }
];

const DEFAULT_CATEGORY = { category: 'Profiles', group: 'Profiles', unit: 'bars' };

/** Reads an absolute 1-based cell out of an offset grid, or '' if out of range. */
function cellAt(grid, row, col) {
  const r = row - grid.startRow;
  const c = col - grid.startCol;
  if (r < 0 || c < 0) return '';
  const line = grid.values[r];
  if (!line) return '';
  const value = line[c];
  return value === undefined || value === null ? '' : value;
}

function text(value) {
  return typeof value === 'string' ? value.trim() : (value === 0 ? '0' : String(value ?? '').trim());
}

/**
 * Numeric coercion that tolerates thousands separators and stray spaces but
 * refuses anything else. Blank is NOT zero - it means "not part of this order",
 * which is a different thing from a computed zero.
 */
function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = String(value ?? '').trim().replace(/,/g, '');
  if (raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function gridBounds(grid) {
  const rowCount = grid.values.length;
  const colCount = grid.values.reduce((max, row) => Math.max(max, row.length), 0);
  return {
    lastRow: grid.startRow + rowCount - 1,
    lastCol: grid.startCol + colCount - 1
  };
}

/**
 * Finds the section title for a block by scanning upwards for a row that
 * matches a known category, rather than taking the first non-empty string.
 *
 * On the real hardware block the nearest title is "EITI-(OP/OP)" and the real
 * one, "HARDWARE", is two rows higher - so nearest-wins misfiles the block.
 * The nearest non-empty string is still kept as a fallback label so the mapping
 * editor has something to show.
 */
function findSectionTitle(grid, headerRow, fromCol, toCol) {
  let nearestLabel = '';

  for (let row = headerRow - 1; row >= headerRow - TITLE_LOOKUP_ROWS && row >= grid.startRow; row--) {
    for (let col = fromCol; col <= toCol; col++) {
      const value = text(cellAt(grid, row, col));
      if (!value) continue;
      if (!nearestLabel) nearestLabel = value;

      const rule = CATEGORY_RULES.find(r => r.re.test(value));
      if (rule) {
        return {
          label: value,
          category: rule.category,
          group: rule.group,
          unit: rule.unit
        };
      }
    }
  }

  return { label: nearestLabel, ...DEFAULT_CATEGORY };
}

/**
 * Locates the quantity column: the first column right of Description that holds
 * at least one number in the rows below the header.
 *
 * A computed 0 counts. An uncalculated template legitimately reads 0 or blank
 * throughout, and refusing to find the column in that case would make the
 * template look broken rather than merely empty.
 */
function findQtyCol(grid, headerRow, descCol, limitCol, lastRow) {
  const maxCol = Math.min(descCol + QTY_SEARCH_WIDTH, limitCol);

  for (let col = descCol + 1; col <= maxCol; col++) {
    for (let row = headerRow + 1; row <= Math.min(headerRow + MAX_BLOCK_ROWS, lastRow); row++) {
      if (toNumber(cellAt(grid, row, col)) !== null) return col;
    }
  }
  // Nothing numeric anywhere - assume the conventional adjacent column so the
  // block is still reported and can be corrected in the mapping editor.
  return Math.min(descCol + 1, limitCol);
}

/**
 * Walks down from a header row to the last data row.
 *
 * Stops on the first row where BOTH S.No and Description are blank, on a
 * "Total" row, or on another block's header - which is what keeps the Steel
 * block (rows 5-8) from swallowing the Hardware block that starts at row 13 in
 * the same columns.
 */
function findDataEnd(grid, headerRow, snoCol, descCol, lastRow) {
  let end = headerRow;

  for (let row = headerRow + 1; row <= Math.min(headerRow + MAX_BLOCK_ROWS, lastRow); row++) {
    const sno = text(cellAt(grid, row, snoCol));
    const desc = text(cellAt(grid, row, descCol));

    if (!sno && !desc) break;
    if (TOTAL_RE.test(desc)) break;
    if (SNO_RE.test(sno) && DESC_RE.test(desc)) break; // next block's header

    end = row;
  }

  return end;
}

/**
 * Finds every S.No|Description|value block on a material grid.
 *
 * Returns blocks in reading order (top-to-bottom, left-to-right) with absolute
 * 1-based coordinates, ready to store on Template.googleSheet.materialMapping.
 */
export function detectBlocks(grid) {
  if (!grid || !Array.isArray(grid.values) || grid.values.length === 0) return [];

  const { lastRow, lastCol } = gridBounds(grid);
  const blocks = [];

  for (let row = grid.startRow; row <= lastRow; row++) {
    for (let col = grid.startCol; col <= lastCol; col++) {
      if (!SNO_RE.test(text(cellAt(grid, row, col)))) continue;

      const descCol = col + 1;
      if (!DESC_RE.test(text(cellAt(grid, row, descCol)))) continue;

      // Don't let this block's quantity search run into the next block that
      // starts on the same header row further right.
      let limitCol = lastCol;
      for (let probe = descCol + 1; probe <= lastCol; probe++) {
        if (SNO_RE.test(text(cellAt(grid, row, probe)))) {
          limitCol = probe - 1;
          break;
        }
      }

      const qtyCol = findQtyCol(grid, row, descCol, limitCol, lastRow);
      const dataEndRow = findDataEnd(grid, row, col, descCol, lastRow);
      if (dataEndRow <= row) continue; // header with no rows under it

      const title = findSectionTitle(grid, row, col, qtyCol);

      blocks.push({
        label: title.label,
        category: title.category,
        group: title.group,
        unit: title.unit,
        headerRow: row,
        snoCol: col,
        descCol,
        qtyCol,
        dataStartRow: row + 1,
        dataEndRow,
        enabled: true
      });
    }
  }

  blocks.sort((a, b) => a.headerRow - b.headerRow || a.snoCol - b.snoCol);
  return blocks;
}

/**
 * Per-item unit override.
 *
 * A "(M)" suffix means the value is metres, not pieces - e.g. "Gas Flat Type(M)"
 * whose formula divides by 1000. Without this, gasket lengths would be reported
 * as a count of items.
 */
function unitForItem(name, blockUnit) {
  if (/\(\s*m\s*\)\s*$/i.test(name)) return 'm';
  return blockUnit;
}

/**
 * Applies a mapping to a material grid and produces the structured lists.
 *
 * Rows are skipped unless they have a description AND a positive numeric
 * quantity, because the tab lists every material the product line can use and
 * only the ones this order consumes are filled in. An uncalculated template
 * therefore maps to empty lists, which is correct rather than broken.
 */
export function mapMaterialGrid(grid, mapping = {}, { warnings = [] } = {}) {
  const totalBomConsumption = [];
  const cuttingList = [];
  const hardwareList = [];
  const glassList = [];

  if (!grid || !Array.isArray(grid.values) || grid.values.length === 0) {
    return { totalBomConsumption, cuttingList, hardwareList, glassList, warnings };
  }

  const blocks = (mapping.blocks && mapping.blocks.length ? mapping.blocks : detectBlocks(grid))
    .filter(b => b.enabled !== false);

  let skippedRows = 0;

  for (const block of blocks) {
    for (let row = block.dataStartRow; row <= block.dataEndRow; row++) {
      const name = text(cellAt(grid, row, block.descCol));
      const qty = toNumber(cellAt(grid, row, block.qtyCol));

      if (!name) continue;
      if (qty === null || qty <= 0) { skippedRows++; continue; }

      const unit = unitForItem(name, block.unit || 'bars');

      totalBomConsumption.push({
        materialName: name,
        category: block.category || 'Profiles',
        group: block.group || block.category || 'Profiles',
        qty,
        unit
      });

      if (block.category === 'Hardware') {
        hardwareList.push({ hardwareName: name, group: block.group || 'Hardware', qty });
      } else if (block.category === 'Profiles') {
        // The material tab holds bar COUNTS, not lengths: the sheet's formulas
        // divide by the 5850mm stock length, so there is no per-piece dimension
        // to recover here. 'Full bar' is what the existing REACT template path
        // already reports for whole-bar consumption, and ProductionCard types
        // cutLength as Mixed precisely to allow it.
        cuttingList.push({ materialName: name, cutLength: 'Full bar', qty, unit });
      }
    }
  }

  // Glass needs per-pane width/height, which the material grid does not carry
  // at all - see mapGlassBlock, which reads the calculation tab instead.
  const glass = mapping.glassBlock;
  if (glass?.enabled) {
    warnings.push('Glass mapping is configured but must be applied against the calculation grid, not the material grid.');
  }

  if (blocks.length === 0) {
    warnings.push('No "S.No / Description / Qty" blocks were found on the material tab, so BOM lists are empty. Map them manually in Material Mapping.');
  } else if (totalBomConsumption.length === 0 && skippedRows > 0) {
    warnings.push(`Found ${blocks.length} material block(s) but every row was blank or zero. The spreadsheet may not have recalculated - check the calculation tab.`);
  }

  return { totalBomConsumption, cuttingList, hardwareList, glassList, warnings };
}

/**
 * Builds glassList from the CALCULATION grid, where per-pane dimensions live.
 *
 * Opt-in by design. A detector hunting for Width/Height headers finds the
 * customer INPUT columns on any sheet without a glass block, and would emit one
 * bogus pane per ordered window. An empty glass list is much cheaper to live
 * with than a wrong one, so this only runs once a human has ticked it on.
 */
export function mapGlassBlock(grid, glassBlock) {
  if (!glassBlock?.enabled || !grid || !Array.isArray(grid.values)) return [];

  const { widthCol, heightCol, nosCol, dataStartRow, dataEndRow, glassType } = glassBlock;
  if (!widthCol || !heightCol || !dataStartRow || !dataEndRow) return [];

  const glassList = [];
  for (let row = dataStartRow; row <= dataEndRow; row++) {
    const width = toNumber(cellAt(grid, row, widthCol));
    const height = toNumber(cellAt(grid, row, heightCol));
    if (width === null || height === null || width <= 0 || height <= 0) continue;

    const nos = nosCol ? toNumber(cellAt(grid, row, nosCol)) : null;
    glassList.push({
      glassType: glassType || 'Glass Unit',
      width,
      height,
      qty: nos !== null && nos > 0 ? nos : 1
    });
  }
  return glassList;
}

/**
 * Suggests a glass block on the calculation tab: a header row carrying both
 * Width and Height, sitting outside the input columns, with "glass" mentioned
 * nearby. Always returned disabled - see mapGlassBlock.
 */
export function detectGlassBlock(blueprint) {
  const cells = blueprint?.cells;
  if (!cells) return null;

  const hints = blueprint.input_field_hints || {};
  const inputCols = new Set(
    [hints.w_no_col, hints.width_col, hints.height_col].filter(Boolean).map(columnToIndex)
  );

  const byRow = new Map();
  for (const cell of Object.values(cells)) {
    const value = typeof cell.value === 'string' ? cell.value.trim().toLowerCase() : '';
    if (!value) continue;
    if (!byRow.has(cell.row)) byRow.set(cell.row, []);
    byRow.get(cell.row).push({ col: cell.col, value });
  }

  for (const [row, entries] of [...byRow.entries()].sort((a, b) => a[0] - b[0])) {
    const width = entries.find(e => e.value.includes('width') && !inputCols.has(e.col));
    const height = entries.find(e => e.value.includes('height') && !inputCols.has(e.col));
    if (!width || !height) continue;

    // Require "glass" on this row or just above it, so derived sash/frame size
    // blocks are not mistaken for glass.
    const nearby = [row, row - 1, row - 2]
      .flatMap(r => byRow.get(r) || [])
      .some(e => /glass|glazing/.test(e.value));
    if (!nearby) continue;

    const nos = entries.find(e => /^nos?\.?$|qty|quantity/.test(e.value));
    return {
      enabled: false,
      widthCol: width.col,
      heightCol: height.col,
      nosCol: nos ? nos.col : null,
      dataStartRow: row + 1,
      dataEndRow: hints.data_end_row || row + 1,
      glassType: 'Glass Unit'
    };
  }

  return null;
}

function columnToIndex(letter) {
  let index = 0;
  for (const ch of String(letter || '').toUpperCase()) {
    if (ch < 'A' || ch > 'Z') return 0;
    index = index * 26 + (ch.charCodeAt(0) - 64);
  }
  return index;
}
