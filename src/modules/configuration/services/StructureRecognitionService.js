import GraphNode from '../models/GraphNode.js';

const getCol = (coord) => {
  const match = coord.match(/^([A-Z]+)/);
  return match ? match[1] : null;
};

const getRow = (coord) => {
  const match = coord.match(/[0-9]+$/);
  return match ? parseInt(match[0], 10) : null;
};

export const recognizeStructures = async (scanId) => {
  const nodes = await GraphNode.find({ scanId, type: 'CELL' }).lean();
  
  // Group by sheet
  const sheets = {};
  nodes.forEach(n => {
    if (!sheets[n.sheet]) sheets[n.sheet] = [];
    sheets[n.sheet].push(n);
  });

  const schedules = [];
  const metadata = [];
  const bomTables = [];

  const METADATA_KEYWORDS = ['date', 'order no', 'project', 'customer'];
  const SCHEDULE_KEYWORDS = ['w.no', 'width', 'height', 'item', 'type', 'qty', 'openable', 'panel', 'openable count', 'panel count'];
  const BOM_KEYWORDS = ['description', 'material', 'qty', 'quantity', 'length', 's.no', 'profile requied', 'profile required'];

  for (const [sheetName, sheetNodes] of Object.entries(sheets)) {
    // Basic heuristic: look for keyword cells
    for (const node of sheetNodes) {
      if (typeof node.value !== 'string') continue;
      const lowerVal = node.value.toLowerCase().trim();

      // Detect Metadata
      if (METADATA_KEYWORDS.some(k => lowerVal.includes(k))) {
        metadata.push({
          sheet: sheetName,
          keywordFound: lowerVal,
          address: node.address
        });
      }
    }
    
    // Find header rows for schedules
    const scheduleRows = new Set();
    const bomRows = new Set();
    
    for (const node of sheetNodes) {
       if (typeof node.value !== 'string') continue;
       const lowerVal = node.value.toLowerCase().trim();
       if (SCHEDULE_KEYWORDS.some(k => lowerVal.includes(k))) scheduleRows.add(getRow(node.address));
       if (BOM_KEYWORDS.some(k => lowerVal.includes(k))) bomRows.add(getRow(node.address));
    }
    
    // Populate full schedule and BOM tables based on the header rows
    // Group adjacent schedule rows (within 2 rows of each other) to support merged/multi-line headers
    let sortedScheduleRows = Array.from(scheduleRows).sort((a,b) => a-b);
    let scheduleGroups = [];
    let currentGroup = [];
    for (const r of sortedScheduleRows) {
        if (currentGroup.length === 0 || r - currentGroup[currentGroup.length - 1] <= 2) {
            currentGroup.push(r);
        } else {
            scheduleGroups.push(currentGroup);
            currentGroup = [r];
        }
    }
    if (currentGroup.length > 0) scheduleGroups.push(currentGroup);

    for (const group of scheduleGroups) {
        const maxRow = Math.max(...group);
        const minRow = Math.min(...group);
        const rowNodes = sheetNodes.filter(n => {
            const r = getRow(n.address);
            return r >= minRow && r <= maxRow && typeof n.value === 'string' && n.value.trim().length > 0;
        });
        if (rowNodes.length >= 2) {
            // Pick the most specific header per column (the one on the lowest row)
            const colMap = new Map();
            for (const n of rowNodes) {
               const c = getCol(n.address);
               const r = getRow(n.address);
               if (!colMap.has(c) || colMap.get(c).row < r) {
                   colMap.set(c, { header: n.value, col: c, row: r });
               }
            }
            schedules.push({
               sheet: sheetName,
               headerRow: maxRow,
               columns: Array.from(colMap.values()).map(v => ({ header: v.header, col: v.col }))
            });
        }
    }
    
    for (const r of bomRows) {
       // Only add to BOM if not already a schedule row
       if (scheduleRows.has(r)) continue;
       const rowNodes = sheetNodes.filter(n => getRow(n.address) === r && typeof n.value === 'string' && n.value.trim().length > 0);
       if (rowNodes.length >= 2) {
          bomTables.push({
             sheet: sheetName,
             headerRow: r,
             columns: rowNodes.map(n => ({ header: n.value, col: getCol(n.address) }))
          });
       }
    }
  }

  // Filter out weak tables (schedules need at least Width/Height, BOM needs Desc/Qty)
  const validSchedules = schedules.filter(s => s.columns.length >= 2);
  const validBom = bomTables.filter(b => b.columns.length >= 2);

  return {
    schedules: validSchedules,
    metadata,
    bomTables: validBom,
    calculationBlocks: [] // To be extracted in phase 4 based on unclassified formulas
  };
};
