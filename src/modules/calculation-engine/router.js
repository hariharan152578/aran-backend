import express from 'express';
import Formula from '../../models/Formula.js';
import { evaluateFormula } from './parser.js';
import { optimize1D } from './optimizer.js';

const router = express.Router();

// GET base status
router.get('/', (req, res) => {
  res.json({ message: 'Aran ERP: Calculation Engine is active' });
});

// POST /calculate - computes dynamic materials list using formulas
router.post('/calculate', async (req, res) => {
  try {
    const { width, height, configuration } = req.body;

    if (!width || !height) {
      return res.status(400).json({ message: 'Width and Height are required parameters' });
    }

    const formulas = await Formula.find({});
    
    // Evaluate each formula
    const materials = formulas.map(f => {
      const calculatedVal = evaluateFormula(f.expression, { width, height });
      
      // Calculate material quantities based on configuration factors
      let quantity = calculatedVal;
      
      // Add custom config adjustments (e.g. SL-SL has 2 handles, FIX has 0 handles)
      if (f.name.includes('Handle')) {
        if (configuration === 'FIX' || configuration === 'FIX-FIX') quantity = 0;
        else if (configuration === 'SL-SL' || configuration === 'OP-OP') quantity = 2;
        else if (configuration === 'OP-OP-OP') quantity = 3;
        else quantity = 1;
      }
      
      if (f.name.includes('Lock')) {
        if (configuration === 'FIX' || configuration === 'FIX-FIX') quantity = 0;
        else if (configuration === 'SL-SL' || configuration === 'OP-OP') quantity = 2;
        else if (configuration === 'OP-OP-OP') quantity = 3;
        else quantity = 1;
      }

      if (f.name.includes('Glass')) {
        if (configuration === 'FIX-FIX' || configuration === 'SL-SL') quantity = calculatedVal;
        else if (configuration === 'OP-OP-OP') quantity = calculatedVal * 0.95; // Mullion deductions
      }

      return {
        name: f.name,
        type: f.type,
        expression: f.expression,
        value: quantity,
        unit: f.unit,
        description: f.description
      };
    });

    res.json({
      configuration,
      width,
      height,
      timestamp: new Date(),
      materials
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /optimize - calculates First-Fit Decreasing packing layout
router.post('/optimize', (req, res) => {
  try {
    const { cuts, barLength } = req.body;
    if (!cuts || !Array.isArray(cuts) || cuts.length === 0) {
      return res.status(400).json({ message: 'Cuts parameter must be a non-empty array' });
    }
    const result = optimize1D(cuts, barLength || 5850);
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
