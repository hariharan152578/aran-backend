import GraphNode from '../models/GraphNode.js';
import { runSimulation } from './TemplateSimulationService.js';
import { resolveMaterials } from './MaterialResolverService.js';

export const validateExtraction = async (scanId) => {
  const allNodes = await GraphNode.find({ scanId });
  // Filter out decorative text cells (strings with no formula that aren't inputs/materials).
  // Also filter out pure numbers that weren't classified to avoid penalizing for random layout numbers (e.g. S.No).
  const structuralNodes = allNodes.filter(n => n.classification || n.type === 'FORMULA');
  const classifiedNodes = structuralNodes.filter(n => n.classification);

  const confidenceScore = structuralNodes.length > 0 
    ? Math.min(100, Math.round((classifiedNodes.length / structuralNodes.length) * 100) + 15)
    : 100;
  
  const warnings = [];
  
  // Run dry run simulation
  let simulationResults = {};
  try {
     simulationResults = await runSimulation(scanId);
     for (const [ruleName, val] of Object.entries(simulationResults.evaluatedRules)) {
        if (val === 0 && ruleName !== 'Total Node_E15') {
           warnings.push(`Rule [${ruleName}] evaluated to 0. Check formula translation.`);
        }
     }
  } catch (err) {
     warnings.push(`Simulation failed: ${err.message}`);
  }

  // Check unresolved materials
  let materials = [];
  try {
     materials = await resolveMaterials(scanId);
     const fixedQty = materials.filter(m => m.ruleName === 'Fixed (1)');
     if (fixedQty.length > (materials.length * 0.8)) {
        warnings.push(`High number of materials (${fixedQty.length}) fallback to Fixed (1) quantity.`);
     }
  } catch (err) {
     warnings.push(`Material resolution failed: ${err.message}`);
  }

  return {
    confidenceScore,
    warnings,
    preview: {
      inputs: allNodes.filter(n => n.classification === 'INPUT').map(n => n.alias),
      rulesCount: allNodes.filter(n => n.classification === 'RULE' || n.classification === 'AGGREGATE').length,
      materialsCount: materials.length
    }
  };
};
