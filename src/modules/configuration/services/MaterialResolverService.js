import GraphNode from '../models/GraphNode.js';
import GraphEdge from '../models/GraphEdge.js';

const getRow = (coord) => {
  const match = coord.match(/[0-9]+$/);
  return match ? parseInt(match[0], 10) : null;
};

export const resolveMaterials = async (scanId) => {
  const materials = await GraphNode.find({ scanId, classification: { $in: ['MATERIAL', 'HARDWARE'] } });
  const allNodes = await GraphNode.find({ scanId });
  const edges = await GraphEdge.find({ scanId });
  
  const nodeMap = new Map();
  for (const n of allNodes) {
    nodeMap.set(n._id.toString(), n);
  }

  const resolved = [];

  for (const matNode of materials) {
    const row = getRow(matNode.address);
    
    // Find all formula nodes in the same row and sheet
    const rowFormulas = allNodes.filter(n => n.sheet === matNode.sheet && getRow(n.address) === row && n.type === 'FORMULA');
    
    let assignedRule = null;

    if (rowFormulas.length > 0) {
      let foundValidDependency = false;
      
      // V3 BOM Intelligence: Semantic Profile Routing
      let bestRule = null;
      let bestScore = -1;
      
      const matNameLower = matNode.alias.toLowerCase();
      const isSash = matNameLower.includes('sash');
      const isFrame = matNameLower.includes('fram');
      const isMullion = matNameLower.includes('mullion');
      const isTrack = matNameLower.includes('track');
      const isBead = matNameLower.includes('bead');

      for (const qtyFormulaNode of rowFormulas) {
        const deps = edges.filter(e => e.targetNodeId.toString() === qtyFormulaNode._id.toString());
        if (deps.length > 0) {
          const sourceNode = nodeMap.get(deps[0].sourceNodeId.toString());
          if (sourceNode && (sourceNode.classification === 'RULE' || sourceNode.alias)) {
             const alias = sourceNode.alias;
             if (!alias) continue;
             let score = 0;
             const lowerAlias = alias.toLowerCase();
             
             // Base score for finding a valid dependency
             score += 10;
             
             if (matNode.classification === 'MATERIAL') {
                 // Profile Type Matching
                 if (isSash && lowerAlias.includes('sash')) score += 100;
                 if (isFrame && lowerAlias.includes('fram')) score += 100;
                 if (isMullion && lowerAlias.includes('mullion')) score += 100;
                 if (isTrack && lowerAlias.includes('track')) score += 100;
                 if (isBead && lowerAlias.includes('bead')) score += 100;

                 // Geometric matching
                 if (lowerAlias.includes('length')) score += 50;
                 else if (lowerAlias.includes('width') || lowerAlias.includes('height')) score += 30;
                 
                 if (lowerAlias.includes('derived') || lowerAlias.includes('shutter')) score += 20;
                 if (lowerAlias.includes('mm')) score -= 40; // Penalize raw input measurements for derived materials
                 if (lowerAlias.includes('count') || lowerAlias.includes('qty')) score -= 50; // Profiles should rarely map to plain counts
             } else if (matNode.classification === 'HARDWARE') {
                 if (lowerAlias.includes('count') || lowerAlias.includes('qty') || lowerAlias.includes('total')) score += 50;
                 if (lowerAlias.includes('espage') || lowerAlias.includes('friction') || lowerAlias.includes('stay')) score += 40;
                 
                 // Specific hardware matching
                 if (matNameLower.includes('espage') && lowerAlias.includes('espage')) score += 100;
                 if (matNameLower.includes('friction') && (lowerAlias.includes('friction') || lowerAlias.includes('fs'))) score += 100;
             }

             if (score > bestScore) {
                 bestScore = score;
                 bestRule = alias;
             }
          }
        }
      }

      if (bestRule) {
          assignedRule = bestRule;
          foundValidDependency = true;
      }

      if (!foundValidDependency) {
        // Fallback for cross-sheet or unmapped edges on the first formula
        const qtyFormulaNode = rowFormulas[0];
        let val = qtyFormulaNode.rawFormula.replace(/\$/g, '');
        if (val.startsWith('=')) val = val.slice(1);
        
        let foundAlias = null;
        const matches = val.match(/[A-Z]+[0-9]+/g);
        if (matches) {
            for (const matchCoord of matches) {
                let targetSheet = matNode.sheet;
                if (val.includes('!')) {
                    const sheetMatch = val.match(new RegExp(`(?:'?[a-zA-Z0-9\\s_-]+'?)!${matchCoord}`));
                    if (sheetMatch) {
                        targetSheet = sheetMatch[0].split('!')[0].replace(/'/g, '');
                    }
                }
                const targetNode = allNodes.find(n => n.sheet === targetSheet && n.address === matchCoord && n.type === 'FORMULA');
                if (targetNode && targetNode.alias) {
                    foundAlias = targetNode.alias;
                    break;
                }
            }
        }
        
        if (foundAlias) {
           assignedRule = foundAlias;
        } else if (!isNaN(val) && val.trim() !== '') {
           assignedRule = `Fixed (${val})`;
        } else if (!val.match(/^[A-Z]+[0-9]+$/)) {
           assignedRule = val;
        }
      }
    } else {
       // Look for cell nodes with hardcoded numbers
       const rowCells = allNodes.filter(n => n.sheet === matNode.sheet && getRow(n.address) === row && n.type === 'CELL');
       // Find the next numeric cell to the right
       const qtyCell = rowCells.find(n => n.address > matNode.address && (typeof n.value === 'number' || (!isNaN(Number(n.value)) && String(n.value).trim() !== '')));
       if (qtyCell) {
          assignedRule = `Fixed (${qtyCell.value})`;
       }
    }

    // Advanced Fallback: Semantic Inference based on Category
    if (!assignedRule) {
       if (matNode.classification === 'MATERIAL') {
           // Profiles usually resolve to a Length or Width calculation
           assignedRule = 'Length';
       } else if (matNode.classification === 'HARDWARE') {
           // Hardware usually resolves to Window Count or a Quantity
           assignedRule = 'Window Count';
       }
    }

    if (row === 5) {
      console.log(`[DEBUG] Material Row 5: ${matNode.alias}`);
      console.log(`  Row Formulas Found: ${rowFormulas.length}`);
      if (rowFormulas.length > 0) {
        const qtyNode = rowFormulas[0];
        console.log(`  Qty Formula: ${qtyNode.rawFormula}`);
        const deps = edges.filter(e => e.targetNodeId.toString() === qtyNode._id.toString());
        if (deps.length > 0) {
          const sourceNode = nodeMap.get(deps[0].sourceNodeId.toString());
          console.log(`  Source Node Alias: ${sourceNode.alias}, Class: ${sourceNode.classification}, assignedRule: ${assignedRule}`);
        }
      }
    }

    resolved.push({
      materialName: matNode.alias,
      category: matNode.classification,
      ruleName: assignedRule || null
    });
  }

  return resolved;
};
