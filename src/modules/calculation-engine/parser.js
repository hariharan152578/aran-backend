/**
 * Safely evaluates mathematical formula expressions with variables.
 * @param {string} expression - The formula string (e.g. "((width + height) * 2) / 5850")
 * @param {object} variables - Key-value pair of variables (e.g. { width: 1200, height: 1500 })
 * @returns {number|null} - Compiled numeric result rounded to 3 decimals, or null on error.
 */
export const evaluateFormula = (expression, variables = {}) => {
  try {
    let sanitized = expression.toLowerCase();
    
    // Replace all variable references with their values
    Object.entries(variables).forEach(([name, val]) => {
      const regex = new RegExp(`\\b${name.toLowerCase()}\\b`, 'g');
      sanitized = sanitized.replace(regex, Number(val));
    });

    // Reject evaluation if variables are missing
    if (/[a-zA-Z]/.test(sanitized)) {
      return null;
    }

    // Validate that only numbers, decimals, spaces, and math symbols exist
    const isSafe = /^[0-9\s.+\-*/()]+$/.test(sanitized);
    if (!isSafe) {
      throw new Error('Expression contains unsafe characters');
    }

    // Evaluate safely
    const result = new Function(`return (${sanitized})`)();
    
    if (isNaN(result) || !isFinite(result)) {
      return null;
    }

    return Number(result.toFixed(3));
  } catch (error) {
    console.error('Formula evaluation error:', error.message);
    return null;
  }
};
