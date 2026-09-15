import GraphNode from '../models/GraphNode.js';
import GraphEdge from '../models/GraphEdge.js';

export const translateFormulas = async (scanId, structures) => {
  const formulaNodes = await GraphNode.find({ scanId, type: 'FORMULA', classification: { $in: ['RULE', 'AGGREGATE'] } });
  const allNodes = await GraphNode.find({ scanId });
  const edges = await GraphEdge.find({ scanId });
  
  const nodeMap = new Map();
  for (const n of allNodes) {
    nodeMap.set(n._id.toString(), n);
  }

  const translations = [];

  // Pass 1: Generate aliases for AGGREGATE nodes
  for (const fNode of formulaNodes) {
    if (fNode.classification === 'AGGREGATE') {
      let formulaStr = fNode.rawFormula;
      if (formulaStr.startsWith('=')) formulaStr = formulaStr.slice(1);
      
      const deps = edges.filter(e => e.targetNodeId.toString() === fNode._id.toString());
      const upper = formulaStr.toUpperCase();
      
      if (upper.startsWith('SUM(')) {
        const sourceNodes = deps.map(d => nodeMap.get(d.sourceNodeId.toString()));
        const validSource = sourceNodes.find(n => n.alias && n.classification === 'INPUT');
        if (validSource) {
           fNode.alias = `Total ${validSource.alias}`;
        } else {
           const internalSource = sourceNodes.find(n => n.alias);
           if (internalSource) fNode.alias = `Total ${internalSource.alias}`;
           else fNode.alias = `Total Unknown Rule (${fNode.address})`;
        }
      } else if (upper.startsWith('COUNTA(') || upper.startsWith('COUNT(')) {
        fNode.alias = 'Window Count';
      }
      
      // Update the nodeMap so Pass 2 sees the newly assigned alias
      const mapNode = nodeMap.get(fNode._id.toString());
      if (mapNode) {
        mapNode.alias = fNode.alias;
      }
      
      await fNode.save();
    }
  }

  const resolveFormulaRecursive = (nodeId, visited = new Set()) => {
    const node = nodeMap.get(nodeId.toString());
    if (!node) return '[Unresolved: Missing Node]';
    
    if (visited.has(nodeId.toString())) {
       return node.alias || `[Circular: Node_${node.address}]`;
    }
    visited.add(nodeId.toString());
    
    if (node.alias) return node.alias;
    
    if (node.type === 'CELL') {
      if (node.value !== undefined && node.value !== null && String(node.value).trim() !== '') {
          return String(node.value);
      }
      
      // Sprint 7: Schedule Context Resolver
      const colMatch = node.address.match(/^([A-Z]+)/);
      const rowMatch = node.address.match(/[0-9]+$/);
      if (colMatch && rowMatch && structures && structures.schedules) {
         const col = colMatch[1];
         const row = parseInt(rowMatch[0], 10);
         for (const schedule of structures.schedules) {
             if (node.sheet === schedule.sheet && row > schedule.headerRow) {
                 const headerMatch = schedule.columns.find(c => c.col === col);
                 if (headerMatch) {
                     return headerMatch.header;
                 }
             }
         }
      }
      return `UNKNOWN_REFERENCE(${node.address})`;
    }
    
    if (node.type === 'FORMULA') {
      let fStr = node.rawFormula;
      if (fStr.startsWith('=')) fStr = fStr.slice(1);
      
      const nodeDeps = edges.filter(e => e.targetNodeId.toString() === node._id.toString());
      
      const uniqueDepsMap = new Map();
      for (const dep of nodeDeps) {
         if (!uniqueDepsMap.has(dep.sourceAddress)) {
             uniqueDepsMap.set(dep.sourceAddress, dep);
         }
      }
      const uniqueDeps = Array.from(uniqueDepsMap.values());
      uniqueDeps.sort((a, b) => b.sourceAddress.length - a.sourceAddress.length);
      
      for (const dep of uniqueDeps) {
        const resolvedStr = resolveFormulaRecursive(dep.sourceNodeId, new Set(visited));
        const sheetRegex = new RegExp(`(?:'?[a-zA-Z0-9\\s_-]+'?!)?\\b${dep.sourceAddress}\\b`, 'g');
        fStr = fStr.replace(sheetRegex, resolvedStr);
      }
      return `(${fStr})`;
    }
    
    return `Unknown Rule (${node.address})`;
  };

  // Pass 2: Replace dependencies in formulas
  for (const fNode of formulaNodes) {
    let formulaStr = fNode.rawFormula;
    if (formulaStr.startsWith('=')) formulaStr = formulaStr.slice(1);

    const deps = edges.filter(e => e.targetNodeId.toString() === fNode._id.toString());
    
    const uniqueDepsMap = new Map();
    for (const dep of deps) {
       if (!uniqueDepsMap.has(dep.sourceAddress)) {
           uniqueDepsMap.set(dep.sourceAddress, dep);
       }
    }
    const uniqueDeps = Array.from(uniqueDepsMap.values());
    uniqueDeps.sort((a, b) => b.sourceAddress.length - a.sourceAddress.length);

    if (fNode.classification === 'AGGREGATE') {
      const upper = formulaStr.toUpperCase();
      if (upper.startsWith('SUM(')) {
        const sourceNodes = uniqueDeps.map(d => nodeMap.get(d.sourceNodeId.toString()));
        const validSource = sourceNodes.find(n => n.alias && n.classification === 'INPUT');
        if (validSource) {
           formulaStr = `SUM(${validSource.alias})`;
        } else {
           formulaStr = `SUM(${fNode.alias.replace('Total ', '')})`;
        }
      } else if (upper.startsWith('COUNTA(') || upper.startsWith('COUNT(')) {
        const sourceNodes = uniqueDeps.map(d => nodeMap.get(d.sourceNodeId.toString()));
        const validSource = sourceNodes.find(n => n && n.alias && n.classification === 'INPUT');
        if (validSource) {
           formulaStr = `COUNTA(${validSource.alias})`;
        } else {
           formulaStr = 'COUNT(scheduleRows)';
        }
      }
    } else {
      for (const dep of uniqueDeps) {
        const resolvedStr = resolveFormulaRecursive(dep.sourceNodeId);
        const sheetRegex = new RegExp(`(?:'?[a-zA-Z0-9\\s_-]+'?!)?\\b${dep.sourceAddress}\\b`, 'g');
        formulaStr = formulaStr.replace(sheetRegex, resolvedStr);
      }
    }

    translations.push({
      nodeId: fNode._id,
      alias: fNode.alias,
      translatedFormula: formulaStr
    });

    fNode.set('translatedFormula', formulaStr);
    await fNode.save();
  }

  return translations;
};
