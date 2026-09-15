/**
 * Tests for the material grid -> BOM list mapper.
 *
 * The fixtures in __fixtures__/ were dumped from the real production workbooks
 * with scripts/dumpMaterialGrid.js, not hand-written, so these assertions
 * describe how the actual sheets behave:
 *
 *   material-fix.json    "Material & Hardware"  26x3, one block
 *   material-louver.json "Material & Hardware"  26x3, one block
 *   material-opop.json   "Profile & Hardwares"  27x9, THREE blocks
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { detectBlocks, mapMaterialGrid, mapGlassBlock, detectGlassBlock } from './materialGridMapper.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const fixture = name => JSON.parse(readFileSync(path.join(dir, '__fixtures__', name), 'utf8'));

const FIX = fixture('material-fix.json');
const OPOP = fixture('material-opop.json');
const LOUVER = fixture('material-louver.json');

// ── detectBlocks ──────────────────────────────────────────────────────────

test('detects the single block on a real "Material & Hardware" tab', () => {
  const blocks = detectBlocks(FIX);
  assert.equal(blocks.length, 1);

  const [block] = blocks;
  assert.equal(block.headerRow, 3);       // "S.No | Description | <order no>"
  assert.equal(block.snoCol, 1);
  assert.equal(block.descCol, 2);
  assert.equal(block.qtyCol, 3);
  assert.equal(block.dataStartRow, 4);
  assert.equal(block.dataEndRow, 26);     // through "Blinds"
  assert.equal(block.category, 'Profiles');
});

test('takes the category from the section title, not the row above the header', () => {
  // Row 2 is "EITI" (a config marker); row 1 is the real title.
  assert.match(detectBlocks(FIX)[0].label, /Material Consumed/);
});

test('detects all three blocks on the real "Profile & Hardwares" tab', () => {
  const blocks = detectBlocks(OPOP);
  assert.equal(blocks.length, 3, 'two side-by-side blocks plus hardware below');

  const [profiles, steel, hardware] = blocks;

  // Left block, rows 5-27.
  assert.deepEqual(
    { headerRow: profiles.headerRow, snoCol: profiles.snoCol, qtyCol: profiles.qtyCol, category: profiles.category },
    { headerRow: 4, snoCol: 1, qtyCol: 3, category: 'Profiles' }
  );

  // Right block on the SAME header row - its quantity search must not run into
  // the left block's columns or vice versa.
  assert.deepEqual(
    { headerRow: steel.headerRow, snoCol: steel.snoCol, qtyCol: steel.qtyCol, group: steel.group },
    { headerRow: 4, snoCol: 5, qtyCol: 7, group: 'Steel' }
  );
  // Steel stops before the hardware header at row 13.
  assert.equal(steel.dataEndRow, 8);

  assert.equal(hardware.headerRow, 13);
  assert.equal(hardware.snoCol, 5);
});

test('classifies the hardware block as Hardware despite a misleading nearest title', () => {
  // THE TRAP: directly above the hardware header (row 13) sits row 12
  // "EITI-(OP/OP)" / "Order no". The word "HARDWARE" is at row 11, two rows up.
  // Taking the nearest non-empty string would file these as Profiles and push
  // handles, locks and friction stays into the cutting list.
  const hardware = detectBlocks(OPOP).find(b => b.headerRow === 13);
  assert.equal(hardware.category, 'Hardware');
  assert.equal(hardware.group, 'Hardware');
  assert.equal(hardware.unit, 'Nos');
  assert.match(hardware.label, /HARDWARE/i);
});

test('recognises a lower-case "S.no" header', () => {
  // The steel and hardware blocks use "S.no", the profile block uses "S.No".
  assert.equal(detectBlocks(OPOP).filter(b => b.snoCol === 5).length, 2);
});

test('returns no blocks for an empty or malformed grid', () => {
  assert.deepEqual(detectBlocks(null), []);
  assert.deepEqual(detectBlocks({ startRow: 1, startCol: 1, values: [] }), []);
  assert.deepEqual(detectBlocks({ startRow: 1, startCol: 1, values: [['no', 'headers']] }), []);
});

test('ignores a header row with no data beneath it', () => {
  const grid = { startRow: 1, startCol: 1, values: [['S.No', 'Description', 'Qty']] };
  assert.deepEqual(detectBlocks(grid), []);
});

// ── mapMaterialGrid ───────────────────────────────────────────────────────

test('emits only rows carrying a positive quantity', () => {
  // The tab is a master catalogue; blank means "not consumed by this order".
  // The FIX fixture was captured from an uncalculated template, so every row
  // reads blank or 0 and the correct result is an empty BOM.
  const { totalBomConsumption, warnings } = mapMaterialGrid(FIX);
  assert.equal(totalBomConsumption.length, 0);
  assert.ok(
    warnings.some(w => /did not recalculate|blank or zero/i.test(w)),
    'an all-blank tab should explain itself rather than look like a success'
  );
});

test('maps a calculated grid into the ProductionCard list shapes', () => {
  // Same layout as the real FIX tab with two rows filled in, which is what a
  // calculated sheet returns.
  const grid = {
    startRow: 1,
    startCol: 1,
    values: [
      ['Material Consumed for this order', '', ''],
      ['EITI', '', ''],
      ['S.No', 'Description', 'ORD-1024'],
      [1, '60 Casement Fram', ''],
      [2, '60 Small Casment Fram', 0.8],
      [3, '60 Single Galzing Bead', 1.2]
    ]
  };

  const { totalBomConsumption, cuttingList, hardwareList, glassList } = mapMaterialGrid(grid);

  assert.deepEqual(totalBomConsumption, [
    { materialName: '60 Small Casment Fram', category: 'Profiles', group: 'Profiles', qty: 0.8, unit: 'bars' },
    { materialName: '60 Single Galzing Bead', category: 'Profiles', group: 'Profiles', qty: 1.2, unit: 'bars' }
  ]);

  // Profiles carry bar counts, not lengths - the sheet already divided by the
  // 5850mm stock length, so there is no per-piece dimension to recover.
  assert.deepEqual(cuttingList, [
    { materialName: '60 Small Casment Fram', cutLength: 'Full bar', qty: 0.8, unit: 'bars' },
    { materialName: '60 Single Galzing Bead', cutLength: 'Full bar', qty: 1.2, unit: 'bars' }
  ]);

  assert.deepEqual(hardwareList, []);
  assert.deepEqual(glassList, []);
});

test('routes hardware rows to hardwareList and keeps them out of cuttingList', () => {
  const grid = {
    startRow: 1,
    startCol: 1,
    values: [
      ['HARDWARE', '', ''],
      ['EITI-(OP/OP)', 'Order no', ''],
      ['S.no', 'Description', 'ORD-1'],
      [1, 'Casment Handel', 4],
      [2, 'Espage 800', 2]
    ]
  };
  const { hardwareList, cuttingList, totalBomConsumption } = mapMaterialGrid(grid);

  assert.deepEqual(hardwareList, [
    { hardwareName: 'Casment Handel', group: 'Hardware', qty: 4 },
    { hardwareName: 'Espage 800', group: 'Hardware', qty: 2 }
  ]);
  assert.equal(cuttingList.length, 0, 'handles are not sawn from bars');
  assert.equal(totalBomConsumption[0].unit, 'Nos');
});

test('treats a "(M)" suffix as metres rather than a piece count', () => {
  // "Gas Flat Type(M)" is a gasket measured in metres; its formula divides by
  // 1000. Reporting it as a count of items would be wrong.
  const grid = {
    startRow: 1,
    startCol: 1,
    values: [
      ['HARDWARE', '', ''],
      ['S.no', 'Description', 'ORD-1'],
      [1, 'Gas Flat Type(M)', 12.5],
      [2, 'Casment Handel', 4]
    ]
  };
  const { totalBomConsumption } = mapMaterialGrid(grid);
  assert.equal(totalBomConsumption.find(r => /Gas Flat/.test(r.materialName)).unit, 'm');
  assert.equal(totalBomConsumption.find(r => /Handel/.test(r.materialName)).unit, 'Nos');
});

test('stops a block at a Total row', () => {
  const grid = {
    startRow: 1,
    startCol: 1,
    values: [
      ['Material Consumed for this order', '', ''],
      ['S.No', 'Description', 'ORD-1'],
      [1, 'Frame', 2],
      ['', 'Total', 2],
      [2, 'Should Not Appear', 9]
    ]
  };
  const { totalBomConsumption } = mapMaterialGrid(grid);
  assert.deepEqual(totalBomConsumption.map(r => r.materialName), ['Frame']);
});

test('skips negative and non-numeric quantities', () => {
  const grid = {
    startRow: 1,
    startCol: 1,
    values: [
      ['Material Consumed for this order', '', ''],
      ['S.No', 'Description', 'ORD-1'],
      [1, 'Negative', -3],
      [2, 'Error', '#REF!'],
      [3, 'Valid', 1.5]
    ]
  };
  assert.deepEqual(mapMaterialGrid(grid).totalBomConsumption.map(r => r.materialName), ['Valid']);
});

test('accepts a quantity written with a thousands separator', () => {
  const grid = {
    startRow: 1,
    startCol: 1,
    values: [
      ['Material Consumed for this order', '', ''],
      ['S.No', 'Description', 'ORD-1'],
      [1, 'Screws', '1,250']
    ]
  };
  assert.equal(mapMaterialGrid(grid).totalBomConsumption[0].qty, 1250);
});

test('honours a stored mapping and its disabled blocks', () => {
  const grid = {
    startRow: 1,
    startCol: 1,
    values: [
      ['Material Consumed for this order', '', ''],
      ['S.No', 'Description', 'ORD-1'],
      [1, 'Frame', 2]
    ]
  };
  // A user re-categorising a block in the mapping editor must take effect.
  const asHardware = mapMaterialGrid(grid, {
    blocks: [{ category: 'Hardware', group: 'Hardware', unit: 'Nos', descCol: 2, qtyCol: 3, dataStartRow: 3, dataEndRow: 3, enabled: true }]
  });
  assert.equal(asHardware.hardwareList.length, 1);
  assert.equal(asHardware.cuttingList.length, 0);

  const disabled = mapMaterialGrid(grid, {
    blocks: [{ category: 'Profiles', descCol: 2, qtyCol: 3, dataStartRow: 3, dataEndRow: 3, enabled: false }]
  });
  assert.equal(disabled.totalBomConsumption.length, 0);
});

test('warns instead of throwing when no block can be found', () => {
  const { totalBomConsumption, warnings } = mapMaterialGrid({
    startRow: 1, startCol: 1, values: [['Rate Card', ''], ['Item', 'Price']]
  });
  assert.equal(totalBomConsumption.length, 0);
  assert.match(warnings.join(' '), /Map them manually/);
});

test('returns empty lists for a missing material grid', () => {
  const result = mapMaterialGrid(null);
  assert.deepEqual(result.totalBomConsumption, []);
  assert.deepEqual(result.cuttingList, []);
});

test('maps every fixture without throwing', () => {
  for (const [name, grid] of [['fix', FIX], ['opop', OPOP], ['louver', LOUVER]]) {
    const result = mapMaterialGrid(grid);
    assert.ok(Array.isArray(result.totalBomConsumption), `${name} produced no array`);
  }
});

test('maps the real OP-OP grid, splitting profiles from hardware', () => {
  // The captured OP-OP tab has one real steel value: "Fram" at 0.3.
  const { totalBomConsumption, cuttingList, hardwareList } = mapMaterialGrid(OPOP);

  const steel = totalBomConsumption.find(r => r.materialName === 'Fram');
  assert.ok(steel, 'expected the steel "Fram" row to be emitted');
  assert.equal(steel.group, 'Steel');
  assert.equal(steel.qty.toFixed(2), '0.30');

  // Steel is a profile, so it belongs in the cutting list; nothing here is hardware.
  assert.ok(cuttingList.some(r => r.materialName === 'Fram'));
  assert.deepEqual(hardwareList, []);
});

// ── glass ─────────────────────────────────────────────────────────────────

test('mapGlassBlock returns nothing while disabled', () => {
  const grid = { startRow: 1, startCol: 1, values: [[1, 1081, 781, 2]] };
  assert.deepEqual(mapGlassBlock(grid, { enabled: false, widthCol: 2, heightCol: 3, dataStartRow: 1, dataEndRow: 1 }), []);
});

test('mapGlassBlock emits panes once enabled', () => {
  const grid = {
    startRow: 1, startCol: 1,
    values: [
      [1, 1081, 781, 2],
      [2, 900, 600, ''],   // no Nos -> defaults to 1
      [3, '', '', '']      // blank row -> skipped
    ]
  };
  const glass = mapGlassBlock(grid, {
    enabled: true, widthCol: 2, heightCol: 3, nosCol: 4,
    dataStartRow: 1, dataEndRow: 3, glassType: '5mm Clear'
  });
  assert.deepEqual(glass, [
    { glassType: '5mm Clear', width: 1081, height: 781, qty: 2 },
    { glassType: '5mm Clear', width: 900, height: 600, qty: 1 }
  ]);
});

test('detectGlassBlock ignores the customer input columns', () => {
  // On a tab whose only Width/Height are the input columns, suggesting a glass
  // block would emit one bogus pane per ordered window.
  const blueprint = {
    input_field_hints: { w_no_col: 'A', width_col: 'B', height_col: 'C', data_end_row: 14 },
    cells: {
      A5: { value: 'W.No', row: 5, col: 1 },
      B5: { value: 'Width(mm)', row: 5, col: 2 },
      C5: { value: 'Height(mm)', row: 5, col: 3 }
    }
  };
  assert.equal(detectGlassBlock(blueprint), null);
});

test('detectGlassBlock finds a real glass block but leaves it disabled', () => {
  const blueprint = {
    input_field_hints: { w_no_col: 'A', width_col: 'B', height_col: 'C', data_end_row: 14 },
    cells: {
      B5: { value: 'Width(mm)', row: 5, col: 2 },
      C5: { value: 'Height(mm)', row: 5, col: 3 },
      R4: { value: 'Glass', row: 4, col: 18 },
      Q5: { value: 'W.no', row: 5, col: 17 },
      R5: { value: 'Width ', row: 5, col: 18 },
      S5: { value: 'Height', row: 5, col: 19 },
      T5: { value: 'Nos', row: 5, col: 20 }
    }
  };
  const detected = detectGlassBlock(blueprint);
  assert.equal(detected.widthCol, 18);
  assert.equal(detected.heightCol, 19);
  assert.equal(detected.nosCol, 20);
  assert.equal(detected.enabled, false, 'glass must require a human tick');
});

test('detectGlassBlock ignores derived size blocks that are not glass', () => {
  // Sash/frame size blocks also have Width and Height headers outside the input
  // columns; only a nearby "glass" mention should qualify.
  const blueprint = {
    input_field_hints: { width_col: 'B', height_col: 'C' },
    cells: {
      M5: { value: 'Fram Width', row: 5, col: 13 },
      L5: { value: 'Height', row: 5, col: 12 }
    }
  };
  assert.equal(detectGlassBlock(blueprint), null);
});
