import TemplateMeasurement from '../configuration/models/TemplateMeasurement.js';
import TemplateFormula from '../configuration/models/TemplateFormula.js';
import TemplateBom from '../configuration/models/TemplateBom.js';
import TemplateHardware from '../configuration/models/TemplateHardware.js';

/**
 * Topologically sorts formulas to ensure dependencies are evaluated first.
 * For now, a naive iterative evaluator that replaces variables until done.
 */
function evaluateMath(expression, scope) {
  try {
    let sanitized = expression.toLowerCase();

    // Clean up accidental JSON bleed if the user's formula contains a malformed description string
    if (sanitized.includes('\",\"description')) {
      sanitized = sanitized.split('\",\"description')[0];
    }
    if (sanitized.includes('","description')) {
      sanitized = sanitized.split('","description')[0];
    }
    // Also remove any trailing quote that might have been left over
    if (sanitized.endsWith('"') || sanitized.endsWith('\\"')) {
      sanitized = sanitized.replace(/\\?"$/, '');
    }
    
    // Replace single '=' with '===' to convert Excel equality to JS equality
    sanitized = sanitized.replace(/(?<![=<>!])=(?![=])/g, '===');

    // Convert Excel 'if(' to JS '_if(' so we can inject a custom if-function
    sanitized = sanitized.replace(/\bif\s*\(/g, '_if(');

    // Convert Excel 'and(' to JS 'and(' and 'or('
    sanitized = sanitized.replace(/\bceiling\b/g, '_ceiling');

    // Replace TODAY() with Date.now() to avoid ReferenceError
    sanitized = sanitized.replace(/today\(\)/g, 'Date.now()');

    sanitized = sanitized.replace(/sum\(([^:]+):[^\)]+\)/g, (match, val) => val.trim());
    sanitized = sanitized.replace(/sum\(([^)]+)\)/g, (match, val) => val.trim());
    sanitized = sanitized.replace(/counta\([^\)]*\)/g, "1");
    sanitized = sanitized.replace(/count\([^\)]*\)/g, "1");

    const cleanKeys = [];
    const cleanValues = [];

    // Sort by length to avoid substring collision during replace
    const sortedOriginalKeys = Object.keys(scope).sort((a,b) => b.length - a.length);

    for (const k of sortedOriginalKeys) {
      // Strip out anything in parentheses (e.g. (mm)), convert spaces to underscores, then strip non-alphanumerics
      const cleanKey = k.replace(/\(.*\)/g, '').trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      if (k !== cleanKey && sanitized.includes(k)) {
         // If the original had bad chars, perfectly replace it in the formula string
         sanitized = sanitized.split(k).join(cleanKey);
      }
      
      // Only push unique clean keys to avoid duplicate parameter name in Function constructor
      if (!cleanKeys.includes(cleanKey)) {
        cleanKeys.push(cleanKey);
        cleanValues.push(Number(scope[k]) || 0);
      }
    }

    const fn = new Function('_if', 'and', 'or', '_ceiling', ...cleanKeys, `return (${sanitized})`);

    const _if = (cond, t, f) => cond ? t : f;
    const _and = (...args) => args.every(Boolean);
    const _or = (...args) => args.some(Boolean);
    const _ceiling = (val, sig) => Math.ceil(val / sig) * sig;

    const res = fn(_if, _and, _or, _ceiling, ...cleanValues);

    if (isNaN(res) || !isFinite(res)) {
       if (typeof res === 'string' && res.trim() === '') return 0;
       throw new Error('NaN result');
    }
    return Number(res);
  } catch (err) {
    console.error(`Error in evaluateMath for expression '${expression}':`, err.message);
    throw err;
  }
}

export const runProductionEngine = async (templateId, lineItems) => {
  // 1. Load the Directed Acyclic Graph (DAG) components
  const inputsDef = await TemplateMeasurement.find({ templateId });
  const rulesDef = await TemplateFormula.find({ templateId });
  const bomMappings = await TemplateBom.find({ templateId }).populate('formulaId');
  const hardwareMappings = await TemplateHardware.find({ templateId }).populate('formulaId');

  const totalConsumptionMap = new Map();
  const cuttingList = []; // Future: Advanced 1D cutting optimization output
  const glassList = [];
  const hardwareListMap = new Map();
  const simulationData = [];

  // 2. Loop through every single window in the Customer Order
  for (const item of lineItems) {
    const qty = item.qty || 1;
    const itemScope = {};
    
    // Helper to resolve measurement values dynamically with unit conversion fallbacks
    const getMeasurementValue = (fieldName, measurementsObj) => {
      if (!measurementsObj) return 0;
      
      const getVal = (key) => {
        if (typeof measurementsObj.get === 'function') {
          return measurementsObj.get(key);
        }
        return measurementsObj[key];
      };

      // Exact match check first
      const exactVal = getVal(fieldName);
      if (exactVal !== undefined && exactVal !== null && exactVal !== '') {
        return Number(exactVal);
      }

      const nameLower = fieldName.toLowerCase();
      
      // Parse current dimension metrics
      const widthMM = Number(getVal('widthMM') || getVal('width') || getVal('Width') || getVal('Width (mm)') || 0);
      const heightMM = Number(getVal('heightMM') || getVal('height') || getVal('Height') || getVal('Height (mm)') || 0);
      
      const widthFT = Number(getVal('widthFT') || 0) || (widthMM ? Math.ceil(((widthMM - 10) / 305) * 4) / 4 : 0);
      const heightFT = Number(getVal('heightFT') || 0) || (heightMM ? Math.ceil(((heightMM - 10) / 305) * 4) / 4 : 0);
      
      const widthIn = Number(getVal('widthIn') || 0) || (widthMM / 25.4);
      const heightIn = Number(getVal('heightIn') || 0) || (heightMM / 25.4);

      // Width key mapping
      if (nameLower === 'width' || nameLower === 'w' || nameLower.includes('width') || nameLower.startsWith('w')) {
        if (nameLower.includes('ft') || nameLower.includes('feet')) {
          return widthFT;
        }
        if (nameLower.includes('inch') || nameLower.includes('in')) {
          return widthIn;
        }
        return widthMM;
      }

      // Height key mapping
      if (nameLower === 'height' || nameLower === 'h' || nameLower.includes('height') || nameLower.startsWith('h')) {
        if (nameLower.includes('ft') || nameLower.includes('feet')) {
          return heightFT;
        }
        if (nameLower.includes('inch') || nameLower.includes('in')) {
          return heightIn;
        }
        return heightMM;
      }

      // Qty key mapping — always resolve from item.qty
      if (nameLower === 'qty' || nameLower === 'quantity') {
        return Number(qty) || 1;
      }

      return 0;
    };

    // 3. Setup Scope (Inputs)
    let scope = {};
    for (const input of inputsDef) {
      const val = getMeasurementValue(input.fieldName, item.measurements);
      scope[input.fieldName.toLowerCase()] = Number(val) || 0;
    }

    // Always inject qty/width/height from the line item directly so formulas
    // that use these variables never see 0 even if they aren't in TemplateMeasurement
    scope['qty']    = scope['qty']    || Number(qty) || 1;
    scope['width']  = scope['width']  || Number(item.measurements?.width  || item.measurements?.Width  || item.measurements?.widthMM  || 0);
    scope['height'] = scope['height'] || Number(item.measurements?.height || item.measurements?.Height || item.measurements?.heightMM || 0);

    // 4. Resolve Rules (DAG Evaluation)
    // We run multiple passes to resolve nested variables (e.g. Rule B depends on Rule A)
    let unresolvedRules = [...rulesDef];
    let pass = 0;
    const maxPasses = 10;
    while (unresolvedRules.length > 0 && pass < maxPasses) {
      pass++;
      let resolvedThisPass = 0;
      let nextUnresolved = [];
      console.log(`\n--- Pass ${pass} ---`);
      
      for (const rule of unresolvedRules) {
        const ruleNameLower = rule.name.toLowerCase();
        const formulaStr = rule.formula;
        
        try {
          const val = evaluateMath(formulaStr, scope);
          scope[ruleNameLower] = val;
          resolvedThisPass++;
          console.log(`Resolved: ${rule.name} = ${val}`);
        } catch (err) {
          nextUnresolved.push(rule);
        }
      }
      
      if (resolvedThisPass === 0) {
        console.log("No rules resolved in this pass. Remaining:", nextUnresolved.map(r => r.name).join(', '));
        for (const rule of nextUnresolved) {
          scope[rule.name.toLowerCase()] = 0;
        }
        break;
      }
      unresolvedRules = nextUnresolved;
    }

    // 5. Apply Material Mappings (BOM)
    for (const bom of bomMappings) {
      const ruleName = bom.formulaId?.name?.toLowerCase();
      let consumed = 0;
      
      if (ruleName && scope[ruleName] !== undefined) {
         consumed = scope[ruleName] * qty;
      } else {
         consumed = 0; // Not linked = not applicable to this window type
      }

      // Add waste
      const withWaste = consumed * (1 + (bom.wastePercentage || 0) / 100);

      const key = `${bom.materialName}_${bom.category}`;
      if (!totalConsumptionMap.has(key)) {
        totalConsumptionMap.set(key, {
          materialName: bom.materialName,
          category: bom.category,
          group: bom.group || 'Profiles',
          qty: 0,
          unit: bom.unit || 'Nos'
        });
      }
      totalConsumptionMap.get(key).qty += withWaste;

      // Derive cut length from the linked formula result
      // If a rule is linked (e.g. fixFrameBars), back-calculate bar length from it.
      // bars = CEILING(((w+h)*2*qty)/barStock), so bar_length = bars * barStock / (2 * qty)
      let cutLength = 0;
      let cutQty = 1 * qty;
      const barStock = bom.barStockLength || 5850;
      if (ruleName && scope[ruleName] > 0) {
        const barCount = scope[ruleName];
        cutLength = Math.round((barCount * barStock) / (2 * qty));
        cutQty = 2 * qty;
      } else {
        // Fallback: use width as the raw frame cut dimension
        cutLength = Math.round(scope['width'] || 1000);
      }
      
      // Store cutLength in totalBomConsumption so frontend can access it
      if (totalConsumptionMap.has(key)) {
        totalConsumptionMap.get(key).cutLength = cutLength;
        totalConsumptionMap.get(key).cutQty = cutQty;
      }

      if (bom.category === 'Profiles' && consumed > 0) {
         cuttingList.push({
           materialName: bom.materialName,
           cutLength: cutLength,
           qty: cutQty
         });
      }

      
      // Mock Glass List
      if (bom.category === 'Glass' && consumed > 0) {
         glassList.push({
           glassType: bom.materialName,
           width: scope['width'] - (bom.glassDeductionW || 100) || 800,
           height: scope['height'] - (bom.glassDeductionH || 100) || 1200,
           qty: 1 * qty
         });
      }
    }

    // 6. Apply Hardware Mappings
    for (const hw of hardwareMappings) {
      const ruleName = hw.formulaId?.name?.toLowerCase();
      let consumed = 0;

      if (ruleName && scope[ruleName] !== undefined) {
         consumed = scope[ruleName] * qty;
      } else {
         consumed = (hw.qty || 1) * qty;
      }

      const key = hw.hardwareName;
      if (!hardwareListMap.has(key)) {
        hardwareListMap.set(key, {
          hardwareName: hw.hardwareName,
          group: hw.group || 'Hardware',
          qty: 0
        });
      }
      hardwareListMap.get(key).qty += consumed;
    }

    simulationData.push({
      windowNo: item.windowNo || 'W1',
      scope
    });
  }

  return {
    totalBomConsumption: Array.from(totalConsumptionMap.values()),
    cuttingList,
    glassList,
    hardwareList: Array.from(hardwareListMap.values()),
    simulationData
  };
};
