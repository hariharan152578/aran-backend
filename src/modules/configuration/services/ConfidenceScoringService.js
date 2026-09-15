export const calculateConfidence = (extractionData, rulesRegistry) => {
  const { inputs, formulas, bom, hardware } = extractionData;
  const mappings = [];

  // Score Measurements (Inputs)
  inputs.forEach(input => {
    let confidence = 70; // Base heuristic confidence
    let mappedField = input.fieldName;
    
    // Check registry
    const ruleMatch = rulesRegistry.find(r => 
      r.category === 'SCHEDULE' && 
      (r.name.toLowerCase() === input.fieldName.toLowerCase() || 
       r.aliases.some(a => a.toLowerCase() === input.fieldName.toLowerCase()))
    );

    if (ruleMatch) {
      confidence = 98;
      mappedField = ruleMatch.name;
    } else {
       // Fuzzy matching penalty
       const partialMatch = rulesRegistry.find(r => 
         r.category === 'SCHEDULE' && 
         (input.fieldName.toLowerCase().includes(r.name.toLowerCase()))
       );
       if (partialMatch) {
          confidence = 85;
          mappedField = partialMatch.name;
       }
    }

    mappings.push({
      fieldName: input.fieldName,
      mappedField,
      originalValue: input.fieldName,
      type: 'MEASUREMENT',
      confidence,
      status: confidence >= 95 ? 'APPROVED' : 'PENDING'
    });
  });

  // Score Formulas (Rules)
  formulas.forEach(formula => {
    let confidence = 85;
    if (formula.isInternal) confidence = 100;
    
    // Check if raw Excel cell references leaked through
    if (formula.formula.match(/[A-Z]+[0-9]+/)) {
       confidence = 60; // Still contains raw Excel cells, dangerous!
    } else if (formula.formula.includes('UNKNOWN_REFERENCE') || formula.formula.includes('Unknown Rule')) {
       // Check if formula has unresolved references
       confidence = 70;
    } else {
       confidence = 95; // Fully translated
    }

    mappings.push({
      fieldName: formula.name,
      mappedField: formula.name,
      originalValue: formula.formula,
      type: 'RULE',
      confidence,
      status: confidence >= 90 ? 'APPROVED' : 'PENDING'
    });
  });

  // Score BOM Linking
  const allMaterials = [...bom, ...hardware];
  allMaterials.forEach(item => {
    let confidence = 0;
    if (item.formulaRef) {
       // Check if formulaRef actually exists in formulas
       const validFormula = formulas.find(f => f.name === item.formulaRef);
       if (validFormula) {
          confidence = 99; // Strong link
       } else if (item.formulaRef.startsWith('Fixed (')) {
          confidence = 90; // Hardcoded fallback link
       } else {
          confidence = 50; // Weak link
       }
    }

    const type = item.category === 'Hardware' ? 'HARDWARE_LINK' : 'BOM_LINK';

    mappings.push({
      fieldName: item.materialName || item.hardwareName,
      mappedField: item.formulaRef || 'Unlinked',
      originalValue: item.materialName || item.hardwareName,
      type,
      confidence,
      status: confidence >= 90 ? 'APPROVED' : 'PENDING'
    });
  });

  // Calculate Granular Confidence
  const calcAvg = (type) => {
      const filtered = mappings.filter(m => m.type === type);
      if (filtered.length === 0) return 100; // No items to score means perfect
      return filtered.reduce((sum, m) => sum + m.confidence, 0) / filtered.length;
  };

  const formulaConfidence = parseFloat(calcAvg('RULE').toFixed(2));
  const materialConfidence = parseFloat(calcAvg('BOM_LINK').toFixed(2));
  const hardwareConfidence = parseFloat(calcAvg('HARDWARE_LINK').toFixed(2));
  
  const totalWeight = mappings.length > 0 ? mappings.length : 1;
  let overallConfidence = mappings.reduce((sum, m) => sum + m.confidence, 0) / totalWeight;

  // If every single mapping was successfully verified/learned (APPROVED), it is functionally a 100% perfect extraction
  const allApproved = mappings.every(m => m.status === 'APPROVED' || m.status === 'AUTO_APPROVED');
  if (allApproved) {
     overallConfidence = 100.00;
  }

  return {
    mappings,
    overallConfidence: parseFloat(overallConfidence.toFixed(2)),
    formulaConfidence,
    bomConfidence: materialConfidence, 
    hardwareConfidence,
    materialConfidence,
    allApproved
  };
};
