import GraphNode from '../models/GraphNode.js';

function evaluateMath(expression, scope) {
  try {
    let sanitized = expression.toLowerCase();
    
    // Replace all known variables in scope
    for (const [key, val] of Object.entries(scope)) {
      // Must replace longest keys first so "Total Width(mm)" doesn't get partially replaced by "Width(mm)"
      // Actually we just use literal replace if we sort by length
      const regex = new RegExp(key.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      sanitized = sanitized.replace(regex, Number(val) || 0);
    }

    if (sanitized.includes('ceiling')) {
      sanitized = sanitized.replace(/ceiling\(([^,]+),([^\)]+)\)/g, (match, val, significance) => {
        return `(Math.ceil(${val} / ${significance}) * ${significance})`;
      });
    }

    sanitized = sanitized.replace(/sum\(([^:]+):[^\)]+\)/g, (match, val) => val.trim());
    sanitized = sanitized.replace(/sum\(([^:]+)\)/g, (match, val) => val.trim());
    sanitized = sanitized.replace(/counta\([^\)]*\)/g, "1");
    sanitized = sanitized.replace(/count\([^\)]*\)/g, "1");

    if (expression.includes('CEILING')) console.log(`Evaluating: ${sanitized}`);

    const fn = new Function(`return (${sanitized})`);
    const res = fn();
    if (isNaN(res) || !isFinite(res)) throw new Error('NaN result');
    return Number(res);
  } catch (err) {
    throw err;
  }
}

export const runSimulation = async (scanId) => {
  const inputs = await GraphNode.find({ scanId, classification: 'INPUT' });
  const rules = await GraphNode.find({ scanId, classification: { $in: ['RULE', 'AGGREGATE'] } });

  const scope = {};
  
  for (const input of inputs) {
    if (input.alias && !scope[input.alias]) {
      const isHeight = input.alias.toLowerCase().includes('height');
      scope[input.alias] = isHeight ? 1200 : 1000;
    }
  }

  let unresolvedRules = [...rules];
  let passCount = 0;
  const results = {};

  while (unresolvedRules.length > 0 && passCount < 10) {
    let resolvedThisPass = 0;
    const nextUnresolved = [];

    const sortedScopeEntries = Object.entries(scope).sort((a, b) => b[0].length - a[0].length);
    const sortedScope = Object.fromEntries(sortedScopeEntries);

    for (const rule of unresolvedRules) {
      if (!rule.alias || !rule.translatedFormula) continue;
      
      try {
        // If the formula contains "Total Width" but "Total Width" is NOT in scope yet, it will throw because of undefined variable.
        // Wait, JS might just treat it as an undefined variable. Let's do a strict check:
        // Instead of strict check, if it evaluates successfully, save it.
        const val = evaluateMath(rule.translatedFormula, sortedScope);
        scope[rule.alias] = val;
        results[rule.alias] = val;
        resolvedThisPass++;
      } catch (err) {
        nextUnresolved.push(rule);
      }
    }

    if (resolvedThisPass === 0) {
      // Force resolve remaining to 0 to avoid infinite loop
      for (const rule of nextUnresolved) {
         results[rule.alias] = 0;
      }
      break; 
    }
    passCount++;
    unresolvedRules = nextUnresolved;
  }

  return {
    simulatedInputs: Object.keys(scope).filter(k => !results.hasOwnProperty(k)).map(k => ({ [k]: scope[k] })),
    evaluatedRules: results
  };
};
