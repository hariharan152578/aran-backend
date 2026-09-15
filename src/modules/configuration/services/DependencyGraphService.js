import WorkbookScan from '../models/WorkbookScan.js';
import GraphNode from '../models/GraphNode.js';
import GraphEdge from '../models/GraphEdge.js';

const getCol = (coord) => {
  const match = coord.match(/^([A-Z]+)/);
  return match ? match[1] : null;
};

const getRow = (coord) => {
  const match = coord.match(/[0-9]+$/);
  return match ? parseInt(match[0], 10) : null;
};

const expandRange = (startCoord, endCoord) => {
  const startCol = getCol(startCoord);
  const startRow = getRow(startCoord);
  const endCol = getCol(endCoord);
  const endRow = getRow(endCoord);

  if (!startCol || !startRow || !endCol || !endRow) return [startCoord];

  const cells = [];
  const sColCode = startCol.charCodeAt(0);
  const eColCode = endCol.charCodeAt(0);

  const minCol = Math.min(sColCode, eColCode);
  const maxCol = Math.max(sColCode, eColCode);
  const minRow = Math.min(startRow, endRow);
  const maxRow = Math.max(startRow, endRow);

  for (let c = minCol; c <= maxCol; c++) {
    const colStr = String.fromCharCode(c);
    for (let r = minRow; r <= maxRow; r++) {
      cells.push(`${colStr}${r}`);
    }
  }
  return cells;
};

export const buildDependencyGraph = async (scanId) => {
  const scan = await WorkbookScan.findById(scanId);
  if (!scan) throw new Error('Scan not found');

  // Clear existing graph for this scan to allow idempotency
  await GraphNode.deleteMany({ scanId });
  await GraphEdge.deleteMany({ scanId });

  const nodeMap = new Map(); // key: "SHEET!ADDRESS"

  // 1. Create nodes for all extracted cells
  for (const cell of scan.cells) {
    const key = `${cell.sheet}!${cell.address}`;
    nodeMap.set(key, {
      scanId,
      sheet: cell.sheet,
      address: cell.address,
      type: 'CELL',
      value: cell.value
    });
  }

  // 2. Overwrite/merge with formulas
  for (const f of scan.formulas) {
    const key = `${f.sheet}!${f.address}`;
    const existing = nodeMap.get(key);
    if (existing) {
      existing.type = 'FORMULA';
      existing.rawFormula = f.formula;
    } else {
      nodeMap.set(key, {
        scanId,
        sheet: f.sheet,
        address: f.address,
        type: 'FORMULA',
        rawFormula: f.formula
      });
    }
  }

  // Save all nodes to DB to get ObjectIds
  const insertedNodes = await GraphNode.insertMany(Array.from(nodeMap.values()));
  
  // Update nodeMap with ObjectIds
  for (const node of insertedNodes) {
    const key = `${node.sheet}!${node.address}`;
    nodeMap.get(key)._id = node._id;
  }

  // 3. Parse dependencies to create edges
  const edgeDocs = [];
  const regex = /(?:'?[a-zA-Z0-9\s_-]+'?!)?\$?[A-Z]+\$?[0-9]+(?:\s*:\s*\$?[A-Z]+\$?[0-9]+)?/g;

  // We only care about formulas for dependencies
  const formulaNodes = Array.from(nodeMap.values()).filter(n => n.type === 'FORMULA');

  for (const fNode of formulaNodes) {
    const formulaStr = fNode.rawFormula;
    let match;
    while ((match = regex.exec(formulaStr)) !== null) {
      let refStr = match[0].replace(/\$/g, '');
      
      let refSheet = fNode.sheet; // Default to same sheet
      let cellStr = refStr;

      if (refStr.includes('!')) {
        const parts = refStr.split('!');
        refSheet = parts[0].replace(/'/g, ''); // Remove single quotes from sheet name
        cellStr = parts[1];
      }

      let dependencies = [];
      if (cellStr.includes(':')) {
        const [start, end] = cellStr.split(':');
        dependencies = expandRange(start.trim(), end.trim());
      } else {
        dependencies = [cellStr];
      }

      for (const depAddress of dependencies) {
        const depKey = `${refSheet}!${depAddress}`;
        
        // If the referenced node doesn't exist (e.g. an empty input cell), create it
        let depNode = nodeMap.get(depKey);
        if (!depNode) {
          const newNodeDoc = {
            scanId,
            sheet: refSheet,
            address: depAddress,
            type: 'CELL',
            value: null
          };
          const inserted = await GraphNode.create(newNodeDoc);
          depNode = { ...newNodeDoc, _id: inserted._id };
          nodeMap.set(depKey, depNode);
        }

        // Create the edge (DepNode -> FormulaNode)
        edgeDocs.push({
          scanId,
          sourceNodeId: depNode._id,
          targetNodeId: fNode._id,
          sourceAddress: depAddress,
          targetAddress: fNode.address
        });
      }
    }
  }

  const insertedEdges = await GraphEdge.insertMany(edgeDocs);

  return {
    nodes: Array.from(nodeMap.values()),
    edges: insertedEdges
  };
};
