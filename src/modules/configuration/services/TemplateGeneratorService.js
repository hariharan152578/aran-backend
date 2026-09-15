import Template from '../models/Template.js';
import TemplateMeasurement from '../models/TemplateMeasurement.js';
import TemplateFormula from '../models/TemplateFormula.js';
import TemplateBom from '../models/TemplateBom.js';
import TemplateHardware from '../models/TemplateHardware.js';
import ImportLog from '../models/ImportLog.js';

/**
 * Generates a full Template and its dependencies from a set of verified extraction rules.
 * @param {Object} rules - The extracted inputs, formulas, bom, and hardware arrays.
 * @param {Object} metadata - The originalFileName, categoryId, subcategoryId, folderId.
 * @returns {String} The generated Template ID.
 */
export const generateTemplateFromRules = async (rules, metadata) => {
  const { originalFileName, categoryId, subcategoryId, folderId } = metadata;
  
  // Normalize formulas keys for DB insertion mapping
  if (rules && rules.formulas && Array.isArray(rules.formulas)) {
    rules.formulas.forEach(f => {
      f.formula = f.formula || f.normalizedFormula || f.excelFormula || '';
    });
  }
  
  // 1. Create the Template
  const templateName = originalFileName.replace('.xlsx', '');
  const newTemplate = new Template({
    name: templateName,
    code: `EXCEL-${Date.now().toString().slice(-6)}`,
    categoryId,
    subcategoryId,
    folderId,
    description: `Auto-generated from ${originalFileName}`,
    status: 'IMPORTED',
    analysisReport: rules.analysis,
    structuralHash: rules.structuralHash || null
  });
  
  await newTemplate.save();
  const tId = newTemplate._id;

  // 2. Save Measurements
  if (rules.inputs && rules.inputs.length > 0) {
    const inserts = rules.inputs.map(i => {
      let mappedType = (i.type || 'number').toLowerCase();
      if (mappedType === 'string') mappedType = 'text';
      if (mappedType === 'boolean') mappedType = 'checkbox';
      return { ...i, type: mappedType, templateId: tId };
    });
    await TemplateMeasurement.insertMany(inserts);
  }

  // 3. Save Formulas and keep track of mapping by name
  const formulaIdMap = {};
  if (rules.formulas && rules.formulas.length > 0) {
    for (const f of rules.formulas) {
      const newFormula = new TemplateFormula({ ...f, templateId: tId });
      await newFormula.save();
      formulaIdMap[f.name] = newFormula._id;
    }
  }

  // 4. Save BOM
  if (rules.bom && rules.bom.length > 0) {
    for (const b of rules.bom) {
      let fId = b.formulaRef ? formulaIdMap[b.formulaRef] : null;
      if (b.formulaRef && !fId && isNaN(Number(b.formulaRef))) {
        // Auto-generate missing inline formula
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
        formulaIdMap[b.formulaRef] = fId; // cache it in case another item uses it
      } else if (b.formulaRef && !fId && !isNaN(Number(b.formulaRef))) {
        // It's a hardcoded number, but formulaRef expects an ID. We can create a simple static formula.
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
      
      await TemplateBom.create({
        ...b,
        templateId: tId,
        formulaId: fId
      });
    }
  }

  // 5. Save Hardware
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

      await TemplateHardware.create({
        ...h,
        templateId: tId,
        formulaId: fId
      });
    }
  }

  // 6. Log the success
  const log = new ImportLog({
    fileName: originalFileName,
    status: 'SUCCESS',
    createdTemplateId: tId
  });
  await log.save();

  return tId;
};
