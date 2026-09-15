import GraphNode from '../models/GraphNode.js';
import GraphEdge from '../models/GraphEdge.js';

const HARDWARE_WHITELIST = ['handle', 'lock', 'roller', 'friction stay', 'espag', 'touch lock', 'hinge', 'screw'];
const PROFILE_DICTIONARY = ['frame', 'mullion', 'sash', 'track', 'panel', 'bead', 'mesh', 'adaptor', 'screen', 'cleat', 'rubber', 'brush', 'blind'];
const KNOWN_INPUTS = ['width', 'height', 'type', 'qty', 'panel count', 'track count', 'opening type', 'w.no'];
const METADATA_KEYWORDS = [
  'date', 'order no', 'project', 'customer', 'description', 'qty', 'remarks', 'item', 's.no', 'w.no', 'sno', 'sno.', 's no',
  'breeze', 'vcutting', 'steel size', 'eiti', 'op/op', 'sl-sl', 'fix'
];
const NOISE_WORDS = ['description', 'remarks', 'notes', 'sheet name', 'title', 'eiti', 'op/op', 'sl-sl', 'fix', 'hardware', 'profile', 'glass', 'color', 'no'];

const getCol = (coord) => {
  const match = coord.match(/^([A-Z]+)/);
  return match ? match[1] : null;
};

const getRow = (coord) => {
  const match = coord.match(/[0-9]+$/);
  return match ? parseInt(match[0], 10) : null;
};

const getColIndex = (colStr) => {
  let index = 0;
  for (let i = 0; i < colStr.length; i++) {
    index = index * 26 + colStr.charCodeAt(i) - 64;
  }
  return index;
};

const getColFromIndex = (index) => {
  let colStr = '';
  let temp = index;
  while (temp > 0) {
    let remainder = (temp - 1) % 26;
    colStr = String.fromCharCode(65 + remainder) + colStr;
    temp = Math.floor((temp - 1) / 26);
  }
  return colStr;
};

const getOffsetCoord = (coord, colOffset, rowOffset) => {
  const colMatch = coord.match(/^([A-Z]+)/);
  const rowMatch = coord.match(/[0-9]+$/);
  if (!colMatch || !rowMatch) return null;
  const col = colMatch[1];
  const row = parseInt(rowMatch[0], 10);
  
  const newColIndex = getColIndex(col) + colOffset;
  if (newColIndex < 1) return null;
  const newCol = getColFromIndex(newColIndex);
  
  const newRow = row + rowOffset;
  if (newRow < 1) return null;
  
  return `${newCol}${newRow}`;
};

const isMetadata = (val) => {
  if (typeof val !== 'string') return false;
  const lower = val.toLowerCase().trim();
  return METADATA_KEYWORDS.some(k => lower.includes(k));
};

export const classifyNodes = async (scanId, structures) => {
  const nodes = await GraphNode.find({ scanId });
  const edges = await GraphEdge.find({ scanId });
  let classifiedCount = 0;
  const usedAliases = new Map();

  // Pre-compute formula targets to detect DERIVED columns
  const targetNodeIds = new Set(edges.map(e => e.targetNodeId.toString()));

  for (const node of nodes) {
    const col = getCol(node.address);
    const row = getRow(node.address);

    let classification = null;
    let alias = null;

    let isFromHeader = false;

    // 0. Priority Classification: Check against Material Dictionaries
    if (node.type === 'CELL' && typeof node.value === 'string') {
        const lowerVal = node.value.toLowerCase();
        const isHardware = HARDWARE_WHITELIST.some(h => lowerVal.includes(h));
        const isProfile = PROFILE_DICTIONARY.some(p => lowerVal.includes(p));
        if (isHardware || isProfile) {
            classification = isHardware ? 'HARDWARE' : 'MATERIAL';
            alias = node.value.trim();
        }
    }

    // 1. Check if it's an INPUT (under a schedule header)
    if (!classification && node.type === 'CELL') {
      for (const schedule of structures.schedules) {
        if (node.sheet === schedule.sheet && row > schedule.headerRow) {
          const headerMatch = schedule.columns.find(c => c.col === col);
          if (headerMatch) {
            // Flow-based classification: Is this cell targeted by a formula?
            const isDerived = targetNodeIds.has(node._id.toString()) || node.type === 'FORMULA';
            
            // Wait, if it has formulas in the column, the whole column is derived
            const columnNodes = nodes.filter(n => n.sheet === node.sheet && getCol(n.address) === col && getRow(n.address) > schedule.headerRow);
            const isDerivedColumn = columnNodes.some(n => n.type === 'FORMULA' || targetNodeIds.has(n._id.toString()));

            const lowerHeader = headerMatch.header.toLowerCase();
            const isHardwareCol = HARDWARE_WHITELIST.some(h => lowerHeader.includes(h));
            const isProfileCol = PROFILE_DICTIONARY.some(p => lowerHeader.includes(p));

            if (!isDerivedColumn && !isHardwareCol && !isProfileCol) {
               classification = 'INPUT';
               alias = headerMatch.header;
               isFromHeader = true;
               break;
            }
          }
        }
      }
    }

    // 2. Check if it's a MATERIAL or HARDWARE
    if (!classification) {
      for (const bom of structures.bomTables) {
        if (node.sheet === bom.sheet && row > bom.headerRow) {
          const descMatch = bom.columns.find(c => c.col === col && c.header.toLowerCase().includes('description'));
          if (descMatch && node.type === 'CELL' && typeof node.value === 'string') {
            const lowerVal = node.value.toLowerCase().trim();
            const isNoise = NOISE_WORDS.some(n => lowerVal === n || lowerVal.includes(n));
            
            if (!isNoise) {
                const isHardware = HARDWARE_WHITELIST.some(h => lowerVal.includes(h));
                classification = isHardware ? 'HARDWARE' : 'MATERIAL';
                alias = node.value.trim();
                break;
            }
          }
        }
      }
    }

    // 3. Check if it's a CONSTANT RULE
    if (!classification && node.type === 'CELL' && typeof node.value === 'number') {
       const leftCoord = getOffsetCoord(node.address, -1, 0);
       if (leftCoord) {
         const leftNode = nodes.find(n => n.sheet === node.sheet && n.address === leftCoord);
         if (leftNode && typeof leftNode.value === 'string') {
             const label = leftNode.value.trim();
             if (label.length > 2 && !isMetadata(label)) {
                 // Check if it's an input col
                 let isInputCol = false;
                 for (const schedule of structures.schedules) {
                    if (schedule.sheet === node.sheet) {
                        const isCol = schedule.columns.find(c => c.col === col);
                        if (isCol) isInputCol = true;
                    }
                 }
                 if (!isInputCol) {
                     classification = 'RULE';
                     alias = label.replace(/[^a-zA-Z0-9 ]/g, '').trim();
                 }
             }
         }
       }
    }

    // 4. Check if it's an AGGREGATE or RULE
    if (!classification && node.type === 'FORMULA') {
      let upperFormula = node.rawFormula.toUpperCase();
      if (upperFormula.startsWith('=')) upperFormula = upperFormula.slice(1);
      
      if (upperFormula.includes('SUM(') || upperFormula.includes('COUNTA(') || upperFormula.includes('COUNT(')) {
        classification = 'AGGREGATE';
        // Alias will be generated in Phase 5
      } else {
        classification = 'RULE';
        
        let candidate = null;
        
        // If it's under a schedule header (e.g. calculated schedule column), use the header text!
        for (const schedule of structures.schedules) {
           if (node.sheet === schedule.sheet && row > schedule.headerRow) {
              const headerMatch = schedule.columns.find(c => c.col === col);
              if (headerMatch && headerMatch.header.trim().length > 0) {
                 candidate = headerMatch.header;
                 isFromHeader = true;
                 break;
              }
           }
        }

        if (!candidate) {
            const resolveAliasInDirection = (xOffset, yOffset, limit) => {
              let words = [];
              for (let i = 1; i <= limit; i++) {
                 const coord = getOffsetCoord(node.address, xOffset * i, yOffset * i);
                 if (!coord) break;
                 const searchNode = nodes.find(n => n.sheet === node.sheet && n.address === coord);
                 if (searchNode && typeof searchNode.value === 'string') {
                    const candidateStr = searchNode.value.replace(/[^a-zA-Z0-9 ]/g, '').trim();
                    if (candidateStr.length > 2 && !isMetadata(candidateStr)) {
                       words.push(candidateStr);
                    } else if (candidateStr.length > 0) {
                       break; // Found something invalid, stop scanning this direction
                    }
                 } else if (searchNode && searchNode.value) {
                    break; // Found a number or something, stop scanning
                 }
              }
              if (words.length > 0) {
                 // Reverse so the farthest header comes first. e.g. Top 2 = Mullion, Top 1 = Height -> "Mullion Height"
                 if (yOffset === -1 && xOffset === 0) words.reverse(); 
                 if (xOffset === -1 && yOffset === 0) words.reverse();
                 return words.join(' ');
              }
              return null;
            };

            candidate = resolveAliasInDirection(-1, 0, 3); // Priority 1: Scan LEFT up to 3 cells
            if (!candidate) candidate = resolveAliasInDirection(0, -1, 2); // Priority 2: Scan TOP up to 2 cells
            if (!candidate) {
               const tlCoord = getOffsetCoord(node.address, -1, -1);
               const tlNode = tlCoord ? nodes.find(n => n.sheet === node.sheet && n.address === tlCoord) : null;
               if (tlNode && typeof tlNode.value === 'string') {
                  const c = tlNode.value.replace(/[^a-zA-Z0-9 ]/g, '').trim();
                  if (c.length > 2 && !isMetadata(c)) candidate = c;
               }
            }
        }

        if (candidate) {
            if (candidate === 'Model') candidate = 'Model Width';
            
            // Strict Namespacing: If this rule shares a name with an actual INPUT column, 
            // prefix it with 'Derived ' to prevent circular references in the formula resolver.
            let isInputHeader = false;
            for (const schedule of structures.schedules) {
                if (schedule.sheet === node.sheet) {
                    // Check if there is an INPUT classified node with this candidate name
                    // Actually, structures.schedules doesn't know classification yet, but we can check if it's an input header
                    // We know a column is an input if it doesn't have formulas (handled in classification 1).
                    // We can just query `nodes` that have classification === 'INPUT' and alias === candidate
                    // BUT they might not have been saved yet because we are iterating.
                    // The simplest is: if another column in the schedule has the same name, or if it's a known input name.
                }
            }
            // Better approach: Since INPUTs are classified FIRST in the loop (because we classify as INPUT before RULE),
            // we can just check if `candidate` is already an alias for an `INPUT`.
            const hasInputCollision = nodes.some(n => n.classification === 'INPUT' && n.alias === candidate);
            
            if (hasInputCollision) {
                candidate = `Derived ${candidate}`;
            }

            alias = candidate;
        }
      }
    }

    if (classification) {
      // Ensure unique alias to prevent circular/overwritten rules
      if (alias) {
        let uniqueAlias = alias;
        let counter = 2;
        let lowerAlias = uniqueAlias.toLowerCase();
        
        // Normalize W.No aliases so they don't duplicate
        const isWNo = lowerAlias.replace(/[^a-z0-9]/g, '') === 'wno';
        if (isWNo) {
            uniqueAlias = 'W.No';
            lowerAlias = 'w.no';
        }
        
        if (classification !== 'INPUT' && !isFromHeader && !isWNo) {
          // If alias exists AND is from a different column, increment it to avoid true collision.
          // If alias exists AND is from the same column, it's just a row iteration! Keep the name.
          while (usedAliases.has(lowerAlias) && !usedAliases.get(lowerAlias).has(col)) {
            uniqueAlias = `${alias} ${counter}`;
            lowerAlias = uniqueAlias.toLowerCase();
            counter++;
          }
        }
        
        alias = uniqueAlias;
        
        if (!usedAliases.has(lowerAlias)) {
          usedAliases.set(lowerAlias, new Set());
        }
        usedAliases.get(lowerAlias).add(col);
      }
      
      node.set('classification', classification); // Assuming schema update or strict:false
      node.set('alias', alias);
      await node.save();
      classifiedCount++;
    }
  }

  return { classifiedCount, totalNodes: nodes.length };
};
