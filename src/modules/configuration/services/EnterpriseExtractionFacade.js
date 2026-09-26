import crypto from 'crypto';
import { scanWorkbook } from './WorkbookScannerService.js';
import { buildDependencyGraph } from './DependencyGraphService.js';
import { recognizeStructures } from './StructureRecognitionService.js';
import { classifyNodes } from './BusinessClassificationService.js';
import { translateFormulas } from './FormulaTranslationService.js';
import { resolveMaterials } from './MaterialResolverService.js';
import { validateExtraction } from './TemplateValidationService.js';
import { calculateConfidence } from './ConfidenceScoringService.js';
import GraphNode from '../models/GraphNode.js';
import RecognitionRule from '../models/RecognitionRule.js';

import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const execPromise = util.promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));


const getCol = (coord) => {
  const match = coord.match(/^([A-Z]+)/);
  return match ? match[1] : null;
};

const getRow = (coord) => {
  const match = coord.match(/[0-9]+$/);
  return match ? parseInt(match[0], 10) : null;
};

export const processExcelToTemplate = async (filePath, originalName) => {
  // Phase 0: Fetch Rules Registry
  const rulesRegistry = await RecognitionRule.find({});

  // Phase 1: Scan
  const scan = await scanWorkbook(filePath, originalName);
  const scanId = scan.scanId;

  // Run the external Python Excel reverse engineering parser
  const pythonScriptPath = path.resolve(__dirname, '../../../../xlsx_to_json.py');
  const tempUploadsDir = path.resolve(process.cwd(), 'temp_uploads');
  if (!fs.existsSync(tempUploadsDir)) {
    try { fs.mkdirSync(tempUploadsDir, { recursive: true, mode: 0o777 }); } catch (e) {}
  }
  const extractionDir = fs.existsSync(tempUploadsDir) ? tempUploadsDir : os.tmpdir();
  const tempJsonPath = path.resolve(extractionDir, `${Date.now()}-extracted.json`);

  const pythonCmd = `python "${pythonScriptPath}" "${filePath}" "${tempJsonPath}" --mode smart`;
  console.log(`Executing Python extraction: ${pythonCmd}`);
  
  try {
    await execPromise(pythonCmd);
  } catch (err) {
    console.error('Python script extraction failed:', err);
    throw new Error(`Python reverse-engineering engine failed: ${err.message}`);
  }

  if (!fs.existsSync(tempJsonPath)) {
    throw new Error('Python engine did not produce the expected JSON output file.');
  }

  let pythonResult;
  try {
    const rawData = fs.readFileSync(tempJsonPath, 'utf8');
    pythonResult = JSON.parse(rawData);
  } catch (err) {
    throw new Error(`Failed to parse Python extraction result: ${err.message}`);
  } finally {
    try {
      fs.unlinkSync(tempJsonPath);
    } catch (e) {
      // Ignored
    }
  }

  // --- Map Python Smart Extraction to Legacy Facade Outputs ---

  // 1. Map Inputs
  const inputs = (pythonResult.inputs || []).map((inp, idx) => {
    // Standardize fieldName to header name if the cleanHeader matches name, or fallback to the clean name itself
    const header = inp.header || inp.name;
    const cleanHeader = header.replace(/\(.*\)/g, '').trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').toLowerCase();
    const fieldName = (cleanHeader === inp.name) ? header : inp.name;
    
    return {
      fieldName,
      type: 'number',
      required: true,
      order: idx + 1
    };
  });

  // 2. Map Formulas (combine variables and calculations)
  const formulas = [];
  
  if (pythonResult.variables) {
    for (const [name, varInfo] of Object.entries(pythonResult.variables)) {
      const isObj = varInfo && typeof varInfo === 'object';
      const formulaStr = isObj ? (varInfo.formula || '0') : (varInfo || '0');
      const isInternal = isObj ? (varInfo.isInternal !== undefined ? varInfo.isInternal : true) : true;
      const unit = isObj ? (varInfo.unit || 'Nos') : 'Nos';
      const dependsOn = isObj ? (varInfo.dependsOn || []) : [];
      const level = isObj ? (varInfo.level || 1) : 1;
      
      formulas.push({
        name,
        formula: formulaStr,
        isInternal,
        unit,
        group: 'Variables',
        description: `Variable: ${name}`,
        dependsOn,
        level
      });
    }
  }

  if (pythonResult.calculations) {
    for (const [name, info] of Object.entries(pythonResult.calculations)) {
      // Avoid duplicates if same name exists in variables
      if (!formulas.some(f => f.name === name)) {
        formulas.push({
          name,
          formula: info.formula || '0',
          isInternal: info.isInternal !== undefined ? info.isInternal : false,
          unit: info.uom || 'Nos',
          group: 'Calculations',
          description: `Calculation: ${name}`,
          dependsOn: info.dependsOn || [],
          level: info.level || 1
        });
      }
    }
  }

  // 3. Map BOM & Hardware Catalogs
  const bom = [];
  const hardware = [];

  // Add active profiles
  if (pythonResult.profiles && Array.isArray(pythonResult.profiles)) {
    pythonResult.profiles.forEach(p => {
      if (p.active) {
        bom.push({
          materialName: p.name,
          category: 'Profiles',
          group: 'Profile Consumed for this order',
          formulaRef: p.formulaRef,
          unit: p.uom || 'length'
        });
      }
    });
  }

  // Add active steel
  if (pythonResult.steel && Array.isArray(pythonResult.steel)) {
    pythonResult.steel.forEach(s => {
      if (s.active) {
        bom.push({
          materialName: s.name,
          category: 'Profiles',
          group: 'Steel Consumed for this order',
          formulaRef: s.formulaRef,
          unit: s.uom || 'length'
        });
      }
    });
  }

  // Add active hardware
  if (pythonResult.hardware && Array.isArray(pythonResult.hardware)) {
    pythonResult.hardware.forEach(h => {
      if (h.active) {
        hardware.push({
          hardwareName: h.name,
          category: 'Hardware',
          group: 'HARDWARE',
          formulaRef: h.formulaRef,
          unit: h.uom || 'Nos'
        });
      }
    });
  }

  // Helper to check if item is already in bom
  const hasBomItem = (name) => bom.some(item => item.materialName === name);

  // Parse Python's unified BOM output for glass or fallbacks
  if (pythonResult.bom && Array.isArray(pythonResult.bom)) {
    pythonResult.bom.forEach(b => {
      const bType = (b.type || '').toLowerCase();
      if (bType === 'glass') {
        if (!hasBomItem(b.item)) {
          bom.push({
            materialName: b.item,
            category: 'Glass',
            group: 'Glass Consumed for this order',
            formulaRef: b.formulaRef,
            unit: b.uom || 'Sq.ft'
          });
        }
      } else if (bType === 'profile' || bType === 'steel') {
        if (!hasBomItem(b.item)) {
          bom.push({
            materialName: b.item,
            category: 'Profiles',
            group: bType === 'steel' ? 'Steel Consumed for this order' : 'Profile Consumed for this order',
            formulaRef: b.formulaRef,
            unit: b.uom || 'length'
          });
        }
      } else if (bType === 'hardware') {
        if (!hardware.some(h => h.hardwareName === b.item)) {
          hardware.push({
            hardwareName: b.item,
            category: 'Hardware',
            group: 'HARDWARE',
            formulaRef: b.formulaRef,
            unit: b.uom || 'Nos'
          });
        }
      } else {
        if (!hasBomItem(b.item)) {
          let cat = 'Profiles';
          let grp = 'Profiles';
          if (bType === 'accessories') { cat = 'Accessories'; grp = 'Accessories'; }
          if (bType === 'consumables') { cat = 'Consumables'; grp = 'Consumables'; }
          if (bType === 'labor') { cat = 'Labor'; grp = 'Labor'; }
          bom.push({
            materialName: b.item,
            category: cat,
            group: grp,
            formulaRef: b.formulaRef,
            unit: b.uom || 'Nos'
          });
        }
      }
    });
  }

  // 4. Calculate Confidence Scoring
  const reviewScore = calculateConfidence({ inputs, formulas, bom, hardware }, rulesRegistry);

  // Replace any fuzzy inputs with their strictly mapped registry fields
  inputs.forEach(input => {
     const reviewMatch = reviewScore.mappings.find(m => m.originalValue === input.fieldName && m.type === 'MEASUREMENT');
     if (reviewMatch && reviewMatch.mappedField) {
         input.fieldName = reviewMatch.mappedField;
     }
  });

  // Overwrite validation auto-approval
  let hasCriticalErrors = false;
  if (!inputs.some(i => i.fieldName === 'Width' || i.fieldName === 'Width(mm)')) hasCriticalErrors = true;
  if (!inputs.some(i => i.fieldName === 'W.No')) hasCriticalErrors = true;

  if (reviewScore.overallConfidence >= 95 && !hasCriticalErrors) {
      reviewScore.mappings.forEach(m => {
         if (m.status === 'PENDING' && m.confidence >= 80) {
             m.status = 'AUTO_APPROVED';
         }
      });
  }

  const finalAllApproved = reviewScore.mappings.every(m => m.status === 'APPROVED' || m.status === 'AUTO_APPROVED');
  if (finalAllApproved) {
      reviewScore.overallConfidence = 100.00;
  }

  // 5. Generate Structural Hash
  const hashPayload = JSON.stringify({
      inputs: inputs.map(i => i.fieldName).sort(),
      formulas: formulas.map(f => f.name).sort(),
      bom: bom.map(b => b.materialName).sort(),
      hardware: hardware.map(h => h.hardwareName).sort()
  });
  const structuralHash = crypto.createHash('sha256').update(hashPayload).digest('hex');

  // 6. Statistics / Analysis metadata
  const analysis = {
    schedule: { 
      detected: (pythonResult.inputs && pythonResult.inputs.length > 0), 
      columnCount: inputs.length 
    },
    rules: { 
      detected: formulas.length 
    },
    materials: { 
      detected: bom.length, 
      linked: bom.filter(b => b.formulaRef).length 
    },
    hardware: { 
      detected: hardware.length 
    },
    internalNodes: { 
      detected: formulas.filter(f => f.isInternal).length 
    },
    simulationReady: true,
    accuracy: reviewScore.overallConfidence
  };

  console.log("PROFILES", (pythonResult.profiles || []).length);
  console.log("STEEL", (pythonResult.steel || []).length);
  console.log("HARDWARE", hardware.length);
  console.log("BOM", bom.length);
  console.log("FORMULAS", formulas.length);

  return {
    inputs,
    formulas,
    bom,
    hardware,
    analysis,
    reviewScore,
    structuralHash,
    scanId
  };
};
