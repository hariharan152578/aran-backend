import fs from 'fs';
import parser from '../../frontend/node_modules/@babel/parser/lib/index.js';

try {
  const content = fs.readFileSync('../frontend/src/modules/crm/Customers.jsx', 'utf-8');
  console.log('Parsing file with Babel...');
  parser.parse(content, {
    sourceType: 'module',
    plugins: ['jsx']
  });
  console.log('Parse successful! No syntax errors.');
} catch (err) {
  console.error('Parse failed:');
  console.error(err.message);
  if (err.loc) {
    console.error(`Line: ${err.loc.line}, Column: ${err.loc.column}`);
    const lines = fs.readFileSync('../frontend/src/modules/crm/Customers.jsx', 'utf-8').split('\n');
    console.error('Context:');
    console.error(lines[err.loc.line - 2]);
    console.error(lines[err.loc.line - 1]);
    console.error(' '.repeat(err.loc.column) + '^');
    console.error(lines[err.loc.line]);
  }
}
