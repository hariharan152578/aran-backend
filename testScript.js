const scope = { orderno: 1, windowno: 1, width: 959, height: 259, currentdate: 0 };
let expression = 'SUM(Width)';

try {
    let sanitized = expression.toLowerCase();
    sanitized = sanitized.replace(/(?<![=<>!])=(?![=])/g, '===');
    sanitized = sanitized.replace(/\bif\s*\(/g, '_if(');
    sanitized = sanitized.replace(/today\(\)/g, 'Date.now()');
    
    const sortedScopeEntries = Object.entries(scope).sort((a, b) => b[0].length - a[0].length);
    const sortedScope = Object.fromEntries(sortedScopeEntries);

    for (const [key, val] of Object.entries(sortedScope)) {
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
    sanitized = sanitized.replace(/counta\([^\)]*\)/g, '1');
    sanitized = sanitized.replace(/count\([^\)]*\)/g, '1');

    const fn = new Function('_if', `return (${sanitized})`);
    const res = fn((cond, t, f) => cond ? t : f);
    console.log('Result:', res);
} catch (e) {
    console.error(e);
}
