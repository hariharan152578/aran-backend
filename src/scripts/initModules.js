import fs from 'fs';
import path from 'path';

const MODULES = [
  'crm',
  'configuration',
  'templates',
  'measurements',
  'quotations',
  'orders',
  'calculation-engine',
  'bom-engine',
  'production',
  'qc',
  'dispatch',
  'installation',
  'warranty',
  'service',
  'accounts',
  'reports',
  'backup',
  'audit',
  'settings'
];

const initModules = () => {
  const baseDir = path.resolve('src/modules');

  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }

  MODULES.forEach(mod => {
    const modDir = path.join(baseDir, mod);
    if (!fs.existsSync(modDir)) {
      fs.mkdirSync(modDir, { recursive: true });
    }

    const routerPath = path.join(modDir, 'router.js');
    if (!fs.existsSync(routerPath)) {
      const code = `import express from 'express';
const router = express.Router();

router.get('/', (req, res) => {
  res.json({ message: 'Aran ERP: ${mod.toUpperCase()} module is active' });
});

export default router;
`;
      fs.writeFileSync(routerPath, code);
      console.log(`Generated router for: ${mod}`);
    }
  });

  console.log('All backend module stubs generated successfully!');
};

initModules();
