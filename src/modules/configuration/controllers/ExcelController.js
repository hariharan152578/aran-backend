import fs from 'fs';
import path from 'path';
import os from 'os';
import Template from '../models/Template.js';
import TemplateMeasurement from '../models/TemplateMeasurement.js';
import TemplateFormula from '../models/TemplateFormula.js';
import TemplateBom from '../models/TemplateBom.js';
import TemplateHardware from '../models/TemplateHardware.js';
import TemplateVersion from '../models/TemplateVersion.js';
import TemplatePricing from '../models/TemplatePricing.js';
import TemplateFeature from '../models/TemplateFeature.js';
import ImportLog from '../models/ImportLog.js';
import TemplateExtractionReview from '../models/TemplateExtractionReview.js';
import RecognitionRule from '../models/RecognitionRule.js';
import { processExcelToTemplate } from '../services/EnterpriseExtractionFacade.js';
import { generateTemplateFromRules } from '../services/TemplateGeneratorService.js';

export const importExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No Excel file uploaded' });
    }

    const { categoryId, subcategoryId, folderId } = req.body;
    
    if (!categoryId) {
      return res.status(400).json({ message: 'Category ID is required to place the imported template' });
    }

    const filePath = req.file.path;
    const originalName = req.file.originalname;

    // Parse workbook asynchronously using the new Enterprise Extraction Engine
    const rules = await processExcelToTemplate(filePath, originalName);

    // Normalize formula fields for Mongoose validation and downstream engine
    if (rules && rules.formulas && Array.isArray(rules.formulas)) {
      rules.formulas.forEach(f => {
        f.formula = f.formula || f.normalizedFormula || f.excelFormula || '';
      });
    }

    try {
      console.log(`Saved uploaded file for debugging: ${filePath}`);
    } catch (e) {
      console.error('Failed to handle temp file:', e);
    }

    // --- PHASE 5: 100% AUTOMATION & VERSIONING ---
    const metadata = {
        originalFileName: originalName,
        categoryId,
        subcategoryId: subcategoryId || null,
        folderId: folderId || null
    };

    // 1. Template Structural Versioning Bypass
    if (rules.structuralHash) {
       const existingTemplate = await Template.findOne({ structuralHash: rules.structuralHash });
       if (existingTemplate) {
           // We found an exact structural match! Bypass review and auto-version it.
           // Snapshot Current State
           const measurements = await TemplateMeasurement.find({ templateId: existingTemplate._id });
           const formulas = await TemplateFormula.find({ templateId: existingTemplate._id });
           const bom = await TemplateBom.find({ templateId: existingTemplate._id });
           const hardware = await TemplateHardware.find({ templateId: existingTemplate._id });
           const pricing = await TemplatePricing.findOne({ templateId: existingTemplate._id });
           const features = await TemplateFeature.find({ templateId: existingTemplate._id });
           
           const snapshot = { template: existingTemplate, measurements, formulas, bom, hardware, pricing, features };
           const newVersionRecord = new TemplateVersion({
             templateId: existingTemplate._id,
             version: existingTemplate.version,
             snapshot
           });
           await newVersionRecord.save();

           // Clear Old Dependencies
           await TemplateMeasurement.deleteMany({ templateId: existingTemplate._id });
           await TemplateFormula.deleteMany({ templateId: existingTemplate._id });
           await TemplateBom.deleteMany({ templateId: existingTemplate._id });
           await TemplateHardware.deleteMany({ templateId: existingTemplate._id });

           // Insert New Dependencies (simulate what generateTemplateFromRules does but for existing template)
           const tId = existingTemplate._id;
           if (rules.inputs && rules.inputs.length > 0) {
             await TemplateMeasurement.insertMany(rules.inputs.map(i => ({ ...i, templateId: tId })));
           }
           const formulaIdMap = {};
           if (rules.formulas && rules.formulas.length > 0) {
             for (const f of rules.formulas) {
               const newFormula = new TemplateFormula({ ...f, templateId: tId });
               await newFormula.save();
               formulaIdMap[f.name] = newFormula._id;
             }
           }
           if (rules.bom && rules.bom.length > 0) {
             for (const b of rules.bom) {
               let fId = b.formulaRef ? formulaIdMap[b.formulaRef] : null;
               if (b.formulaRef && !fId && isNaN(Number(b.formulaRef))) {
                 const inlineFormula = new TemplateFormula({
                   templateId: tId,
                   name: `${b.materialName.replace(/[^a-zA-Z0-9]/g, '')}Qty`,
                   group: 'Internal Auto-Generated',
                   formula: b.formulaRef,
                   description: `Auto-generated formula for ${b.materialName}`,
                   isInternal: true
                 });
                 await inlineFormula.save();
                 fId = inlineFormula._id;
                 formulaIdMap[b.formulaRef] = fId;
               } else if (b.formulaRef && !fId && !isNaN(Number(b.formulaRef))) {
                 const staticFormula = new TemplateFormula({
                   templateId: tId,
                   name: `${b.materialName.replace(/[^a-zA-Z0-9]/g, '')}Fixed`,
                   group: 'Internal Auto-Generated',
                   formula: String(Number(b.formulaRef)),
                   description: `Fixed quantity for ${b.materialName}`,
                   isInternal: true
                 });
                 await staticFormula.save();
                 fId = staticFormula._id;
                 formulaIdMap[b.formulaRef] = fId;
               }
               await TemplateBom.create({ ...b, templateId: tId, formulaId: fId });
             }
           }
           if (rules.hardware && rules.hardware.length > 0) {
             for (const h of rules.hardware) {
               let fId = h.formulaRef ? formulaIdMap[h.formulaRef] : null;
               if (h.formulaRef && !fId && isNaN(Number(h.formulaRef))) {
                 const inlineFormula = new TemplateFormula({
                   templateId: tId,
                   name: `${h.hardwareName.replace(/[^a-zA-Z0-9]/g, '')}Qty`,
                   group: 'Internal Auto-Generated',
                   formula: h.formulaRef,
                   description: `Auto-generated formula for ${h.hardwareName}`,
                   isInternal: true
                 });
                 await inlineFormula.save();
                 fId = inlineFormula._id;
                 formulaIdMap[h.formulaRef] = fId;
               } else if (h.formulaRef && !fId && !isNaN(Number(h.formulaRef))) {
                 const staticFormula = new TemplateFormula({
                   templateId: tId,
                   name: `${h.hardwareName.replace(/[^a-zA-Z0-9]/g, '')}Fixed`,
                   group: 'Internal Auto-Generated',
                   formula: String(Number(h.formulaRef)),
                   description: `Fixed quantity for ${h.hardwareName}`,
                   isInternal: true
                 });
                 await staticFormula.save();
                 fId = staticFormula._id;
                 formulaIdMap[h.formulaRef] = fId;
               }
               await TemplateHardware.create({ ...h, templateId: tId, formulaId: fId });
             }
           }

           // Bump Version
           const currentVer = parseFloat(existingTemplate.version || '1.0');
           existingTemplate.version = (currentVer + 1.0).toFixed(1);
           existingTemplate.analysisReport = rules.analysis;
           await existingTemplate.save();

           const log = new ImportLog({
             fileName: originalName,
             status: 'SUCCESS',
             createdTemplateId: existingTemplate._id
           });
           await log.save();

           return res.json({ 
               success: true, 
               requiresReview: false, 
               version: existingTemplate.version, 
               templateId: existingTemplate._id 
           });
       }
    }

    // 2. 100% Automation Bypass (Perfect Extraction)
    const allApproved = rules.reviewScore.mappings.every(m => m.status === 'APPROVED' || m.status === 'AUTO_APPROVED');
    
    // Always create a read-only review record for audit trails (Enterprise Practice)
    const newReview = new TemplateExtractionReview({
      scanId: rules.scanId,
      mappings: rules.reviewScore.mappings,
      overallConfidence: rules.reviewScore.overallConfidence,
      formulaConfidence: rules.reviewScore.formulaConfidence,
      hardwareConfidence: rules.reviewScore.hardwareConfidence,
      bomConfidence: rules.reviewScore.bomConfidence,
      materialConfidence: rules.reviewScore.materialConfidence,
      rawExtractionData: rules,
      metadata,
      reviewStatus: allApproved ? 'COMPLETED' : 'REQUIRES_REVIEW'
    });
    
    if (allApproved) {
        // Fast-track generation without UI intervention
        const templateId = await generateTemplateFromRules(rules, metadata);
        newReview.templateId = templateId;
        await newReview.save();

        return res.json({
            success: true,
            requiresReview: false,
            reviewScore: rules.reviewScore,
            templateId: templateId
        });
    }

    // 3. Fallback: Requires Manual Review
    await newReview.save();

    res.json({
      success: true,
      reviewId: newReview._id,
      analysis: rules.analysis,
      reviewScore: rules.reviewScore,
      requiresReview: true
    });
  } catch (error) {
    const log = new ImportLog({
      fileName: req.file ? req.file.originalname : 'Unknown',
      status: 'FAILED',
      errorDetails: error.message
    });
    await log.save();
    res.status(500).json({ message: error.message });
  }
};

export const getImportLogs = async (req, res) => {
  try {
    const logs = await ImportLog.find().populate('createdTemplateId').sort({ createdAt: -1 }).limit(50);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const importExcelVersion = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No Excel file uploaded' });
    }
    const { templateId } = req.params;
    const template = await Template.findById(templateId);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    // 1. Snapshot Current State
    const measurements = await TemplateMeasurement.find({ templateId });
    const formulas = await TemplateFormula.find({ templateId });
    const bom = await TemplateBom.find({ templateId });
    const hardware = await TemplateHardware.find({ templateId });
    const pricing = await TemplatePricing.findOne({ templateId });
    const features = await TemplateFeature.find({ templateId });
    
    const snapshot = { template, measurements, formulas, bom, hardware, pricing, features };
    const newVersionRecord = new TemplateVersion({
      templateId,
      version: template.version,
      snapshot
    });
    await newVersionRecord.save();

    // 2. Parse New Excel using the Enterprise Extraction Engine
    const filePath = req.file.path;
    const originalName = req.file.originalname;
    const rules = await processExcelToTemplate(filePath, originalName);

    // Normalize formula fields for Mongoose validation and downstream engine
    if (rules && rules.formulas && Array.isArray(rules.formulas)) {
      rules.formulas.forEach(f => {
        f.formula = f.formula || f.normalizedFormula || f.excelFormula || '';
      });
    }

    // 3. Clear Old Dependencies
    await TemplateMeasurement.deleteMany({ templateId });
    await TemplateFormula.deleteMany({ templateId });
    await TemplateBom.deleteMany({ templateId });
    await TemplateHardware.deleteMany({ templateId });

    // 4. Insert New Dependencies
    if (rules.inputs && rules.inputs.length > 0) {
      await TemplateMeasurement.insertMany(rules.inputs.map(i => ({ ...i, templateId })));
    }
    const formulaIdMap = {};
    if (rules.formulas && rules.formulas.length > 0) {
      for (const f of rules.formulas) {
        const newFormula = new TemplateFormula({ ...f, templateId });
        await newFormula.save();
        formulaIdMap[f.name] = newFormula._id;
      }
    }
    if (rules.bom && rules.bom.length > 0) {
      await TemplateBom.insertMany(rules.bom.map(b => ({
        ...b, templateId, formulaId: b.formulaRef ? formulaIdMap[b.formulaRef] : null
      })));
    }
    if (rules.hardware && rules.hardware.length > 0) {
      await TemplateHardware.insertMany(rules.hardware.map(h => ({
        ...h, templateId, formulaId: h.formulaRef ? formulaIdMap[h.formulaRef] : null
      })));
    }

    // 5. Bump Version & Update Analysis
    const currentVer = parseFloat(template.version || '1.0');
    template.version = (currentVer + 1.0).toFixed(1);
    template.analysisReport = rules.analysis;
    if (rules.structuralHash) template.structuralHash = rules.structuralHash;
    await template.save();

    const log = new ImportLog({
      fileName: originalName,
      status: 'SUCCESS',
      createdTemplateId: templateId
    });
    await log.save();

    res.json({ success: true, version: template.version, analysis: rules.analysis });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const downloadOriginalExcel = async (req, res) => {
  try {
    const { templateId } = req.params;
    const template = await Template.findById(templateId);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    const originalName = `${template.name}.xlsx`;

    const candidateDirs = [
      path.resolve(process.cwd(), 'temp_uploads'),
      path.resolve(process.cwd(), 'node_modules/.temp_uploads'),
      os.tmpdir()
    ];
    let matchingFiles = [];
    let foundDir = null;

    for (const dir of candidateDirs) {
      if (fs.existsSync(dir)) {
        try {
          const files = fs.readdirSync(dir);
          const matches = files.filter(f => f.endsWith(`-${originalName}`) || f.endsWith(originalName));
          if (matches.length > 0) {
            matchingFiles = matches;
            foundDir = dir;
            break;
          }
        } catch (e) {}
      }
    }

    if (!foundDir || matchingFiles.length === 0) {
      return res.status(404).json({ message: 'Original file is no longer available on the server' });
    }

    matchingFiles.sort();
    const targetFile = matchingFiles[matchingFiles.length - 1];
    
    const filePath = path.join(foundDir, targetFile);
    res.download(filePath, originalName);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const review = await TemplateExtractionReview.findById(reviewId);
    if (!review) return res.status(404).json({ message: 'Review not found' });
    res.json(review);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const learnPattern = async (category, originalValue, mappedField) => {
    let rule = await RecognitionRule.findOne({ name: mappedField, category });
    if (rule) {
        if (!rule.aliases.includes(originalValue)) {
            rule.aliases.push(originalValue);
            await rule.save();
        }
    } else {
        await RecognitionRule.create({
            name: mappedField,
            aliases: [originalValue],
            category
        });
    }
};

export const approveReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { modifiedMappings } = req.body; 

    const review = await TemplateExtractionReview.findById(reviewId);
    if (!review) return res.status(404).json({ message: 'Review not found' });
    if (review.reviewStatus === 'COMPLETED') return res.status(400).json({ message: 'Review already completed' });

    let rules = review.rawExtractionData;
    const metadata = review.metadata;

    // Apply modified mappings and update raw rules
    if (modifiedMappings && modifiedMappings.length > 0) {
      for (const mapping of modifiedMappings) {
        // Update raw data
        if (mapping.type === 'MEASUREMENT') {
          const input = rules.inputs.find(i => i.fieldName === mapping.originalValue);
          if (input) input.fieldName = mapping.mappedField;
        }
        else if (mapping.type === 'RULE') {
          const formula = rules.formulas.find(f => f.name === mapping.originalValue);
          if (formula) formula.name = mapping.mappedField;
          
          // Must also update references in BOM and Hardware that pointed to the old rule name
          if (rules.bom) {
              rules.bom.forEach(b => { if(b.formulaRef === mapping.originalValue) b.formulaRef = mapping.mappedField; });
          }
          if (rules.hardware) {
              rules.hardware.forEach(h => { if(h.formulaRef === mapping.originalValue) h.formulaRef = mapping.mappedField; });
          }
        }
        else if (mapping.type === 'BOM_LINK') {
          const bomItem = rules.bom.find(b => b.materialName === mapping.originalValue);
          if (bomItem) bomItem.formulaRef = mapping.mappedField;
        }
        else if (mapping.type === 'HARDWARE_LINK') {
          const hwItem = rules.hardware.find(h => h.hardwareName === mapping.originalValue);
          if (hwItem) hwItem.formulaRef = mapping.mappedField;
        }
      }
    }

    // Now learn ALL mappings (including overrides)
    const finalMappings = review.mappings.map(m => {
        const override = modifiedMappings?.find(mod => mod.originalValue === m.originalValue && mod.type === m.type);
        return override ? { ...m, mappedField: override.mappedField } : m;
    });

    for (const mapping of finalMappings) {
        if (mapping.type === 'MEASUREMENT') {
            await learnPattern('SCHEDULE', mapping.originalValue, mapping.mappedField);
        } else if (mapping.type === 'RULE') {
            await learnPattern('SCHEDULE', mapping.originalValue, mapping.mappedField);
        } else if (mapping.type === 'BOM_LINK') {
            await learnPattern('BOM', mapping.originalValue, mapping.mappedField);
        } else if (mapping.type === 'HARDWARE_LINK') {
            await learnPattern('HARDWARE', mapping.originalValue, mapping.mappedField);
        }
    }

    // Re-generate Template using the shared service
    const tId = await generateTemplateFromRules(rules, metadata);

    // Update review status
    review.reviewStatus = 'COMPLETED';
    review.templateId = tId;
    await review.save();

    res.json({
      success: true,
      templateId: tId,
      extractedRules: rules
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const importJson = async (req, res) => {
  try {
    const { categoryId, subcategoryId, folderId, rules } = req.body;
    
    if (!categoryId) {
      return res.status(400).json({ message: 'Category ID is required to place the imported template' });
    }

    if (!rules) {
      return res.status(400).json({ message: 'JSON rules payload is required' });
    }

    const metadata = {
        originalFileName: rules.fileName || 'Direct_JSON_Import',
        categoryId,
        subcategoryId: subcategoryId || null,
        folderId: folderId || null
    };

    // Fast-track generation without UI intervention
    const templateId = await generateTemplateFromRules(rules, metadata);

    const log = new ImportLog({
      fileName: rules.fileName || 'Direct_JSON_Import.json',
      status: 'SUCCESS',
      createdTemplateId: templateId
    });
    await log.save();

    return res.json({
        success: true,
        requiresReview: false,
        templateId: templateId
    });
  } catch (error) {
    const log = new ImportLog({
      fileName: 'Direct_JSON_Import',
      status: 'FAILED',
      errorDetails: error.message
    });
    await log.save();
    res.status(500).json({ message: error.message });
  }
};

export const importReact = async (req, res) => {
  try {
    let { name, code, categoryId, subcategoryId, folderId, reactCode } = req.body;

    // If file is uploaded, read code from file
    if (req.file) {
      reactCode = fs.readFileSync(req.file.path, 'utf8');
      // Delete temporary file
      try {
        fs.unlinkSync(req.file.path);
      } catch (err) {
        console.error('Failed to delete uploaded react file:', err);
      }
    }

    if (!categoryId) {
      return res.status(400).json({ message: 'Category ID is required to place the template' });
    }

    if (!reactCode || reactCode.trim() === '') {
      return res.status(400).json({ message: 'React component code is required' });
    }

    // Sanitize code to filter out stray markdown fences and bolding leaks
    reactCode = reactCode.split('\n')
      .filter(line => !/^```[a-zA-Z]*$/.test(line.trim()))
      .join('\n')
      .trim();

    // Auto-fix LLM markdown bolding leaks in code (e.g. window.**DIGITAL_TWIN** -> window.__DIGITAL_TWIN__)
    reactCode = reactCode.replace(/window\.\*\*DIGITAL_TWIN\*\*/g, 'window.__DIGITAL_TWIN__');
    reactCode = reactCode.replace(/\*\*([a-zA-Z0-9_]+)\*\*/g, '$1');

    if (!name) {
      name = req.file ? req.file.originalname.replace(/\.(jsx|tsx|js|ts)$/i, '') : 'React_Template';
    }

    if (!code) {
      code = `REACT-${Date.now().toString().slice(-6)}`;
    }

    // Check if code is unique
    const existing = await Template.findOne({ code });
    if (existing) {
      return res.status(400).json({ message: `Template with code '${code}' already exists` });
    }

    // Extract JS variables for analysisReport metadata
    const extractJsObject = (jsCode, varName) => {
      const regex = new RegExp(`(?:const|let|var)?\\s*${varName}\\s*=\\s*([\\s\\S]*?);\\s*(?:const|let|var|function|export|window|\\n|$)`);
      const match = jsCode.match(regex);
      if (!match) return null;
      
      let str = match[1].trim();
      if (str.endsWith(';')) str = str.slice(0, -1).trim();
      
      try {
        const fn = new Function(`return (${str})`);
        return fn();
      } catch (e) {
        console.error(`Failed to parse JS literal for ${varName}:`, e);
        return null;
      }
    };

    const metadata = extractJsObject(reactCode, 'workbookMetadata') || {};
    const sheetTypeMap = extractJsObject(reactCode, 'sheetTypeMap') || {};
    const formulaRegistry = extractJsObject(reactCode, 'formulaRegistry') || [];
    const dependencyGraph = extractJsObject(reactCode, 'dependencyGraph') || {};
    const extractionConfidence = extractJsObject(reactCode, 'extractionConfidence') || [];
    const validationReport = extractJsObject(reactCode, 'validationReport') || {};
    const orderHeader = extractJsObject(reactCode, 'orderHeader') || {};
    const scheduleColumns = extractJsObject(reactCode, 'scheduleColumns') || [];
    const discoveredInputs = extractJsObject(reactCode, 'discoveredInputs') || {};
    const productionOutputs = extractJsObject(reactCode, 'productionOutputs') || [];
    const bomSummary = extractJsObject(reactCode, 'bomSummary') || [];
    const hardwareSummary = extractJsObject(reactCode, 'hardwareSummary') || [];
    const orderSummary = extractJsObject(reactCode, 'orderSummary') || {};
    const validationRules = extractJsObject(reactCode, 'validationRules') || [];

    let accuracy = 100;
    if (Array.isArray(extractionConfidence) && extractionConfidence.length > 0) {
      const sum = extractionConfidence.reduce((acc, curr) => acc + (curr.confidence || 100), 0);
      accuracy = Math.round(sum / extractionConfidence.length);
    }

    const analysisReport = {
      workbookName: metadata.workbookName || name,
      sheets: metadata.sheets || [],
      sheetTypeMap,
      formulaRegistry,
      dependencyGraph,
      extractionConfidence,
      validationReport,
      accuracy,
      orderHeader,
      scheduleColumns,
      discoveredInputs,
      productionOutputs,
      bomSummary,
      hardwareSummary,
      orderSummary,
      validationRules
    };

    // Create the Template record
    const newTemplate = new Template({
      name,
      code,
      categoryId,
      subcategoryId: subcategoryId || null,
      folderId: folderId || null,
      description: `Dynamic React template imported on ${new Date().toLocaleDateString()}`,
      status: 'VALIDATED', // Directly validated since it is custom code
      templateType: 'REACT_COMPONENT',
      reactCode,
      analysisReport
    });

    await newTemplate.save();

    // Initialize default pricing record
    await new TemplatePricing({ templateId: newTemplate._id }).save();

    const log = new ImportLog({
      fileName: req.file ? req.file.originalname : 'Direct_React_Code_Import.jsx',
      status: 'SUCCESS',
      createdTemplateId: newTemplate._id
    });
    await log.save();

    return res.json({
      success: true,
      templateId: newTemplate._id,
      template: newTemplate
    });
  } catch (error) {
    const log = new ImportLog({
      fileName: req.file ? req.file.originalname : 'React_Code_Import_Failed',
      status: 'FAILED',
      errorDetails: error.message
    });
    await log.save();
    res.status(500).json({ message: error.message });
  }
};
