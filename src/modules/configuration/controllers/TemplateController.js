import mongoose from 'mongoose';
import Template from '../models/Template.js';
import Category from '../models/Category.js';
import TemplateMeasurement from '../models/TemplateMeasurement.js';
import TemplateFeature from '../models/TemplateFeature.js';
import TemplateFormula from '../models/TemplateFormula.js';
import TemplateBom from '../models/TemplateBom.js';
import TemplateHardware from '../models/TemplateHardware.js';
import TemplatePricing from '../models/TemplatePricing.js';
import TemplateVersion from '../models/TemplateVersion.js';
import { runEngine } from '../../calculation-engine/engineDispatcher.js';
import TemplateSheetStructure from '../models/TemplateSheetStructure.js';

// ---- TEMPLATE CORE CRUD ----
export const getTemplates = async (req, res) => {
  try {
    const filter = {};
    if (req.query.categoryId) {
      filter.categoryId = req.query.categoryId;
    } else if (req.query.profile) {
      const profileName = req.query.profile.trim();
      const escaped = profileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rootCat = await Category.findOne({
        parentId: null,
        name: { $regex: new RegExp(`^${escaped}$`, 'i') }
      });
      if (rootCat) {
        const matchingCategories = await Category.find({
          $or: [
            { _id: rootCat._id },
            { path: { $regex: new RegExp(`^${escaped}(,|$)`, 'i') } }
          ]
        });
        const categoryIds = matchingCategories.map(c => c._id);
        filter.categoryId = { $in: categoryIds };
      } else {
        return res.json([]);
      }
    }
    const templates = await Template.find(filter).populate('categoryId subcategoryId folderId').sort({ createdAt: -1 });
    res.json(templates);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getTemplateById = async (req, res) => {
  try {
    const { id } = req.params;
    let template = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      template = await Template.findById(id).populate('categoryId subcategoryId folderId');
    }
    if (!template) {
      template = await Template.findOne({ code: id }).populate('categoryId subcategoryId folderId')
        || await Template.findOne({ name: id }).populate('categoryId subcategoryId folderId');
    }
    if (!template) return res.status(404).json({ message: 'Template not found' });
    res.json(template);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createTemplate = async (req, res) => {
  try {
    const newTemplate = new Template(req.body);
    await newTemplate.save();
    
    // Also initialize default pricing record
    await new TemplatePricing({ templateId: newTemplate._id }).save();

    res.status(201).json(newTemplate);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const updateTemplate = async (req, res) => {
  try {
    const template = await Template.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(template);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const deleteTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    await Template.findByIdAndDelete(id);
    await TemplateMeasurement.deleteMany({ templateId: id });
    await TemplateFeature.deleteMany({ templateId: id });
    await TemplateFormula.deleteMany({ templateId: id });
    await TemplateBom.deleteMany({ templateId: id });
    await TemplateHardware.deleteMany({ templateId: id });
    await TemplatePricing.deleteMany({ templateId: id });
    await TemplateVersion.deleteMany({ templateId: id });
    // Clean up the cached layout blueprint for Google Sheet templates.
    await TemplateSheetStructure.deleteMany({ templateId: id });
    res.json({ success: true, message: 'Template and all dependencies deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ---- TABS CRUD ----
// Measurements
export const getMeasurements = async (req, res) => {
  try {
    let templateId = req.params.templateId;

    // Resolve by ObjectId first, then by code, then by name
    let resolvedId = null;
    if (mongoose.Types.ObjectId.isValid(templateId)) {
      resolvedId = templateId;
    } else {
      const tmpl = await Template.findOne({ code: templateId })
        || await Template.findOne({ name: templateId });
      if (tmpl) resolvedId = tmpl._id;
    }

    if (!resolvedId) {
      return res.json([]); // No template found → return empty list gracefully
    }

    const items = await TemplateMeasurement.find({ templateId: resolvedId }).sort({ order: 1 });
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const saveMeasurements = async (req, res) => {
  try {
    const { templateId } = req.params;
    await TemplateMeasurement.deleteMany({ templateId });
    if (req.body.measurements && req.body.measurements.length > 0) {
      const inserts = req.body.measurements.map((m, i) => ({ ...m, templateId, order: i }));
      await TemplateMeasurement.insertMany(inserts);
    }
    const items = await TemplateMeasurement.find({ templateId }).sort({ order: 1 });
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Features
export const getFeatures = async (req, res) => {
  try {
    const items = await TemplateFeature.find({ templateId: req.params.templateId });
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const saveFeatures = async (req, res) => {
  try {
    const { templateId } = req.params;
    await TemplateFeature.deleteMany({ templateId });
    if (req.body.featureIds && req.body.featureIds.length > 0) {
      const inserts = req.body.featureIds.map(fId => ({ templateId, featureId: fId }));
      await TemplateFeature.insertMany(inserts);
    }
    const items = await TemplateFeature.find({ templateId });
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Formulas
export const getFormulas = async (req, res) => {
  try {
    const items = await TemplateFormula.find({ templateId: req.params.templateId });
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const saveFormulas = async (req, res) => {
  try {
    const { templateId } = req.params;
    await TemplateFormula.deleteMany({ templateId });
    if (req.body.formulas && req.body.formulas.length > 0) {
      const inserts = req.body.formulas.map(f => ({ ...f, templateId }));
      await TemplateFormula.insertMany(inserts);
    }
    const items = await TemplateFormula.find({ templateId });
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// BOM
export const getBom = async (req, res) => {
  try {
    const items = await TemplateBom.find({ templateId: req.params.templateId }).populate('formulaId');
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const saveBom = async (req, res) => {
  try {
    const { templateId } = req.params;
    await TemplateBom.deleteMany({ templateId });
    if (req.body.bom && req.body.bom.length > 0) {
      const inserts = req.body.bom.map(b => ({ ...b, templateId }));
      await TemplateBom.insertMany(inserts);
    }
    const items = await TemplateBom.find({ templateId }).populate('formulaId');
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Hardware
export const getHardware = async (req, res) => {
  try {
    const items = await TemplateHardware.find({ templateId: req.params.templateId }).populate('formulaId');
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const saveHardware = async (req, res) => {
  try {
    const { templateId } = req.params;
    await TemplateHardware.deleteMany({ templateId });
    if (req.body.hardware && req.body.hardware.length > 0) {
      const inserts = req.body.hardware.map(h => ({ ...h, templateId }));
      await TemplateHardware.insertMany(inserts);
    }
    const items = await TemplateHardware.find({ templateId }).populate('formulaId');
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Pricing
export const getPricing = async (req, res) => {
  try {
    let pricing = await TemplatePricing.findOne({ templateId: req.params.templateId });
    if (!pricing) {
      pricing = await new TemplatePricing({ templateId: req.params.templateId }).save();
    }
    res.json(pricing);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const savePricing = async (req, res) => {
  try {
    const { templateId } = req.params;
    const pricing = await TemplatePricing.findOneAndUpdate(
      { templateId },
      { $set: req.body },
      { new: true, upsert: true }
    );
    res.json(pricing);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Versioning
export const saveVersionSnapshot = async (req, res) => {
  try {
    const { templateId } = req.params;
    const { version } = req.body;
    
    // Aggregate snapshot
    const template = await Template.findById(templateId);
    const measurements = await TemplateMeasurement.find({ templateId });
    const formulas = await TemplateFormula.find({ templateId });
    const bom = await TemplateBom.find({ templateId });
    const hardware = await TemplateHardware.find({ templateId });
    const pricing = await TemplatePricing.findOne({ templateId });
    const features = await TemplateFeature.find({ templateId });

    const snapshot = {
      template,
      measurements,
      formulas,
      bom,
      hardware,
      pricing,
      features
    };

    const newVersion = new TemplateVersion({
      templateId,
      version,
      snapshot
    });

    await newVersion.save();
    
    // Update active version
    template.version = version;
    await template.save();

    res.status(201).json(newVersion);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getVersions = async (req, res) => {
  try {
    const versions = await TemplateVersion.find({ templateId: req.params.templateId }).sort({ createdAt: -1 });
    res.json(versions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const simulateTemplate = async (req, res) => {
  try {
    let { templateId } = req.params;
    const { lineItems, orderNo = 'ORD-SIM', orderDate, date } = req.body;
    
    if (!lineItems || !Array.isArray(lineItems)) {
      return res.status(400).json({ message: 'lineItems array is required for simulation.' });
    }

    // Resolve by ObjectId first, then by code, then by name
    let resolvedId = null;
    if (mongoose.Types.ObjectId.isValid(templateId)) {
      resolvedId = templateId;
    } else {
      const tmpl = await Template.findOne({ code: templateId })
        || await Template.findOne({ name: templateId });
      if (tmpl) resolvedId = tmpl._id;
    }

    // resolveTemplate inside runEngine has the same ObjectId→code→name chain,
    // but we already have the resolved document here — pass it directly so the
    // engine doesn't repeat the Mongo lookups.
    const tmpl = await Template.findById(resolvedId);
    if (!tmpl) return res.status(404).json({ message: 'Template not found for simulation.' });

    const effectiveDate = orderDate || date || new Date().toISOString().split('T')[0];
    const simulationResult = await runEngine(tmpl, lineItems, { orderNo, orderDate: effectiveDate, date: effectiveDate });
    res.json(simulationResult);
  } catch (error) {
    console.error('Simulation Error:', error);
    res.status(500).json({ message: 'Failed to run simulation', details: error.message });
  }
};

/**
 * POST /api/configuration/templates/google-sheet
 *
 * Creates a GOOGLE_SHEET template and immediately fetches + caches its
 * blueprint, so the template is render-ready without a second request.
 *
 * Why this lives here and not in the sheets module:
 *   - It creates a Template document, which is a configuration concern.
 *   - It must also initialise TemplatePricing, exactly as createTemplate does.
 *   - The client does NOT post the blueprint (express.json caps at 100KB and
 *     blueprints exceed it); the server re-fetches after saving.
 *
 * The `code` field is required+unique. The three-field modal doesn't collect
 * it, so this handler generates one following the same precedent as
 * TemplateGeneratorService: GS-{NAME}-{TAB}, numeric suffix on collision.
 */
export const createGoogleSheetTemplate = async (req, res) => {
  const { refreshStructure } = await import('../../../modules/sheets/structureService.js');

  try {
    const {
      name, description = '', categoryId, subcategoryId, folderId,
      webAppUrl, sheetName, materialSheetName = '',
      inputHints = null,
      defaultPrintPages = [],
      customCellStyles = {}
    } = req.body;

    if (!name) return res.status(400).json({ message: 'name is required.' });
    if (!categoryId) return res.status(400).json({ message: 'categoryId is required.' });
    if (!webAppUrl) return res.status(400).json({ message: 'webAppUrl is required.' });
    if (!sheetName) return res.status(400).json({ message: 'sheetName is required.' });

    // Generate a collision-safe code: GS-{NAME_SLUG}-{TAB_SLUG}[-N]
    const slug = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    const baseCode = `GS-${slug(name)}-${slug(sheetName)}`;
    let code = baseCode;
    let suffix = 1;
    while (await Template.findOne({ code })) {
      code = `${baseCode}-${suffix++}`;
    }

    const templateData = {
      name, code, description, categoryId, subcategoryId, folderId,
      templateType: 'GOOGLE_SHEET',
      status: 'VALIDATED',
      googleSheet: { 
        webAppUrl, 
        sheetName, 
        materialSheetName,
        ...(inputHints ? { inputHints } : {}),
        ...(Array.isArray(defaultPrintPages) && defaultPrintPages.length > 0 ? { defaultPrintPages } : {}),
        ...(customCellStyles && Object.keys(customCellStyles).length > 0 ? { customCellStyles } : {})
      }
    };

    const template = new Template(templateData);
    await template.save();
    await new TemplatePricing({ templateId: template._id }).save();

    // Fetch and cache the blueprint server-side
    let blueprintWarnings = [];
    try {
      const result = await refreshStructure(template);
      blueprintWarnings = result.warnings || [];

      // If user supplied explicit custom inputHints, defaultPrintPages, or customCellStyles, ensure they are preserved
      const updates = {};
      if (inputHints) {
        updates['googleSheet.inputHints'] = inputHints;
      }
      if (Array.isArray(defaultPrintPages) && defaultPrintPages.length > 0) {
        updates['googleSheet.defaultPrintPages'] = defaultPrintPages;
      }
      if (customCellStyles && Object.keys(customCellStyles).length > 0) {
        updates['googleSheet.customCellStyles'] = customCellStyles;
      }

      if (Object.keys(updates).length > 0) {
        await Template.updateOne(
          { _id: template._id },
          { $set: updates }
        );
        if (inputHints) template.googleSheet.inputHints = inputHints;
        if (defaultPrintPages?.length) template.googleSheet.defaultPrintPages = defaultPrintPages;
        if (customCellStyles) template.googleSheet.customCellStyles = customCellStyles;
      }
    } catch (bpErr) {
      blueprintWarnings = [`Blueprint fetch failed: ${bpErr.message}. Click "Refresh structure" to retry.`];
    }

    res.status(201).json({ template, warnings: blueprintWarnings });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

/**
 * PUT /api/configuration/templates/google-sheet/:id
 *
 * Full update for a GOOGLE_SHEET template:
 * updates name, productName, description, webAppUrl, sheetName, materialSheetName,
 * inputHints, defaultPrintPages, and customCellStyles.
 * If webAppUrl or sheetName changed, automatically re-caches structure.
 */
export const updateGoogleSheetTemplate = async (req, res) => {
  const { refreshStructure } = await import('../../../modules/sheets/structureService.js');

  try {
    const { id } = req.params;
    const {
      name, productName, description,
      webAppUrl, sheetName, materialSheetName,
      inputHints, defaultPrintPages, customCellStyles
    } = req.body;

    const template = await Template.findById(id);
    if (!template) return res.status(404).json({ message: 'Template not found' });

    if (name) template.name = name.trim();
    if (productName !== undefined) template.productName = productName.trim();
    if (description !== undefined) template.description = description.trim();

    if (!template.googleSheet) template.googleSheet = {};

    const urlChanged = webAppUrl && webAppUrl.trim() !== template.googleSheet.webAppUrl;
    const sheetChanged = sheetName && sheetName !== template.googleSheet.sheetName;

    if (webAppUrl) template.googleSheet.webAppUrl = webAppUrl.trim();
    if (sheetName) template.googleSheet.sheetName = sheetName;
    if (materialSheetName !== undefined) template.googleSheet.materialSheetName = materialSheetName;
    if (inputHints !== undefined) template.googleSheet.inputHints = inputHints;
    if (defaultPrintPages !== undefined) template.googleSheet.defaultPrintPages = defaultPrintPages;
    if (customCellStyles !== undefined) template.googleSheet.customCellStyles = customCellStyles;

    await template.save();

    let blueprintWarnings = [];
    try {
      if (urlChanged || sheetChanged) {
        const result = await refreshStructure(template);
        blueprintWarnings = result.warnings || [];
        
        // Preserve custom hints, default print pages, and custom styles
        const updates = {};
        if (inputHints) updates['googleSheet.inputHints'] = inputHints;
        if (Array.isArray(defaultPrintPages) && defaultPrintPages.length > 0) updates['googleSheet.defaultPrintPages'] = defaultPrintPages;
        if (customCellStyles) updates['googleSheet.customCellStyles'] = customCellStyles;
        if (Object.keys(updates).length > 0) {
          await Template.updateOne({ _id: template._id }, { $set: updates });
        }
      }
    } catch (bpErr) {
      blueprintWarnings = [`Blueprint fetch failed: ${bpErr.message}.`];
    }

    res.json({ ok: true, template, warnings: blueprintWarnings });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const exportTemplateJson = async (req, res) => {
  try {
    const { id } = req.params;
    const template = await Template.findById(id);
    if (!template) return res.status(404).json({ message: 'Template not found' });
    
    const measurements = await TemplateMeasurement.find({ templateId: id });
    const formulas = await TemplateFormula.find({ templateId: id });
    const bom = await TemplateBom.find({ templateId: id });
    const hardware = await TemplateHardware.find({ templateId: id });
    
    const exportData = {
      template,
      measurements,
      formulas,
      bom,
      hardware
    };
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${template.name}_Compiled_Graph.json"`);
    res.send(JSON.stringify(exportData, null, 2));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
