import xlsx from 'xlsx';

// ---------------------------------------------------------
// HELPER FUNCTIONS
// ---------------------------------------------------------
const getCol = (coord) => {
  const match = coord.match(/^([A-Z]+)/);
  return match ? match[1] : null;
};

const getRow = (coord) => {
  const match = coord.match(/[0-9]+$/);
  return match ? parseInt(match[0], 10) : null;
};

const getOffsetCoord = (coord, offsetCol, offsetRow) => {
  const colStr = getCol(coord);
  const rowNum = getRow(coord);
  if (!colStr || !rowNum) return null;
  
  let colNum = 0;
  for (let i = 0; i < colStr.length; i++) {
    colNum = colNum * 26 + (colStr.charCodeAt(i) - 64);
  }
  
  colNum += offsetCol;
  if (colNum < 1) return null;
  
  let newColStr = '';
  let tempCol = colNum;
  while (tempCol > 0) {
    let rem = (tempCol - 1) % 26;
    newColStr = String.fromCharCode(65 + rem) + newColStr;
    tempCol = Math.floor((tempCol - 1) / 26);
  }
  
  let newRow = rowNum + offsetRow;
  if (newRow < 1) return null;
  
  return newColStr + newRow;
};

const METADATA_BLACKLIST = [
  'order', 'date', 'project', 'customer', 's.no', 'w.no', 'eiti', 
  'material consumed', 'description', 'qty', 'unit', 'formula', 'heightmm', 'widthmm'
];

const isMetadata = (str) => {
  if (!str) return false;
  const lower = str.toLowerCase().replace(/\s/g, '');
  return METADATA_BLACKLIST.some(b => lower.includes(b.replace(/\s/g, '')));
};

// Default fallback generator
const defaultImport = (filename) => {
  return {
    inputs: [
      { fieldName: "Width", type: "number", required: true, order: 1 },
      { fieldName: "Height", type: "number", required: true, order: 2 }
    ],
    formulas: [],
    bom: [],
    hardware: [],
    analysis: {
      schedule: { detected: false, columns: ["Width", "Height"], columnCount: 2 },
      rules: { detected: 0, items: [] },
      materials: { detected: 0, linked: 0, unlinked: 0 },
      hardware: { detected: 0 },
      internalNodes: { detected: 0 },
      simulationReady: false,
      accuracy: 0
    }
  };
};

export const parseExcelRules = (filePath, originalName = '') => {
  try {
    const workbook = xlsx.readFile(filePath);
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return defaultImport(originalName || filePath);
    }

    // ==========================================
    // STAGE 1: INTELLIGENT SHEET DISCOVERY
    // ==========================================
    let fixSheetName = workbook.SheetNames.find(n => {
      const lower = n.toLowerCase();
      return lower.includes('fix') || lower.includes('calc') || lower.includes('rule');
    }) || workbook.SheetNames[0];
    
    let matSheetName = workbook.SheetNames.find(n => {
      const lower = n.toLowerCase();
      return lower.includes('material') || lower.includes('bom') || lower.includes('hardware');
    }) || (workbook.SheetNames.length > 1 ? workbook.SheetNames[1] : workbook.SheetNames[0]);
    
    const fixSheet = workbook.Sheets[fixSheetName];
    const matSheet = workbook.Sheets[matSheetName];

    const extractedInputs = [];
    const extractedFormulas = [];
    const extractedBom = [];
    const extractedHardware = [];

    const inputColumnMap = {}; 
    const ruleCoordinateMap = {};
    const internalNodesMap = {}; 

    // ==========================================
    // STAGE 2: COLUMNAR INPUT DISCOVERY (SCHEDULE ENGINE)
    // ==========================================
    for (let key in fixSheet) {
      if (key[0] === '!') continue;
      const cell = fixSheet[key];
      if (!cell || !cell.v || typeof cell.v !== 'string') continue;

      const normalized = cell.v.toLowerCase().replace(/\s/g, "");
      
      let detectedInput = null;
      if (normalized.includes("width") && !isMetadata(cell.v)) detectedInput = "Width";
      else if (normalized.includes("height") && !isMetadata(cell.v)) detectedInput = "Height";

      if (detectedInput) {
        if (!inputColumnMap[detectedInput]) {
          inputColumnMap[detectedInput] = [];
          extractedInputs.push({
            fieldName: detectedInput,
            type: 'number',
            required: true,
            order: extractedInputs.length + 1
          });
        }
        
        const colLetter = getCol(key);
        if (colLetter && !inputColumnMap[detectedInput].includes(colLetter)) {
          inputColumnMap[detectedInput].push(colLetter);
        }
      }
    }

    // ==========================================
    // STAGE 3: FULL WORKBOOK GRAPH EXTRACTION
    // ==========================================
    for (let key in fixSheet) {
      if (key[0] === '!') continue;
      const cell = fixSheet[key];
      
      let isFormula = !!(cell && cell.f);
      let isConstantRule = false;
      
      if (!isFormula && cell && cell.v !== undefined && typeof cell.v === 'number') {
         const leftCoord = getOffsetCoord(key, -1, 0);
         if (leftCoord && fixSheet[leftCoord] && typeof fixSheet[leftCoord].v === 'string') {
             const label = fixSheet[leftCoord].v.trim();
             if (label.length > 2 && !isMetadata(label)) {
                 const col = getCol(key);
                 let isInputCol = false;
                 for (const cols of Object.values(inputColumnMap)) {
                     if (cols.includes(col)) { isInputCol = true; break; }
                 }
                 if (!isInputCol) {
                     isConstantRule = true;
                 }
             }
         }
      }

      if (cell && (isFormula || isConstantRule)) {
        const rawFormulaValue = isFormula ? cell.f : String(cell.v);
        
        // --- METADATA FILTER ENGINE ---
        // If the formula itself is TODAY() or something purely administrative, check left cell to ban it.
        const leftCoord = getOffsetCoord(key, -1, 0);
        if (leftCoord && fixSheet[leftCoord] && isMetadata(fixSheet[leftCoord].v)) {
           continue; // Completely skip this node (e.g. Date, Order No)
        }

        // --- ALIAS RESOLVER ENGINE ---
        const searchDirections = [
          getOffsetCoord(key, -1, 0), // Left 1
          getOffsetCoord(key, -2, 0), // Left 2
          getOffsetCoord(key, 0, -1), // Top 1
          getOffsetCoord(key, 0, -2), // Top 2
          getOffsetCoord(key, 0, -3), // Top 3
          getOffsetCoord(key, 0, -4), // Top 4
          getOffsetCoord(key, 0, -5), // Top 5
          getOffsetCoord(key, -1, -1) // Top-Left
        ];

        let publicRuleName = null;
        for (const searchCoord of searchDirections) {
          if (!searchCoord) continue;
          const searchCell = fixSheet[searchCoord];
          if (searchCell && searchCell.v && typeof searchCell.v === 'string') {
            let candidate = searchCell.v.replace(/[^a-zA-Z0-9 ]/g, '').trim();
            if (candidate.length > 2 && !isMetadata(candidate)) {
              if (candidate === 'Model') {
                candidate = 'Model Width';
              }
              // If it's literally just the name of an input like "Width" but it's a formula column
              if (Object.keys(inputColumnMap).includes(candidate)) {
                candidate = `Derived ${candidate}`;
              }
              publicRuleName = candidate;
              break;
            }
          }
        }

        // --- AGGREGATE RULE DETECTION ---
        if (!publicRuleName) {
           const upperFormula = rawFormulaValue.toUpperCase();
           if (upperFormula.startsWith('SUM(')) {
             const colMatch = upperFormula.match(/([A-Z]+)\d+:([A-Z]+)\d+/);
             if (colMatch && colMatch[1] === colMatch[2]) {
               const sumCol = colMatch[1];
               let foundInput = null;
               for (const [inpName, cols] of Object.entries(inputColumnMap)) {
                  if (cols.includes(sumCol)) {
                    foundInput = inpName;
                    break;
                  }
               }
               if (foundInput) {
                 publicRuleName = `Total ${foundInput}`;
               } else {
                 for (const [coord, mapped] of Object.entries(ruleCoordinateMap)) {
                    if (getCol(coord) === sumCol && !mapped.startsWith('Node_')) {
                      publicRuleName = `Total ${mapped}`;
                      break;
                    }
                 }
               }
             }
           } else if (upperFormula.startsWith('COUNTA(') || upperFormula.startsWith('COUNT(')) {
             publicRuleName = 'Window Count';
           }
        }

        let finalRuleName = publicRuleName;
        if (finalRuleName) {
            let dupCount = 1;
            while (Object.values(ruleCoordinateMap).includes(finalRuleName)) {
               finalRuleName = `${publicRuleName} ${dupCount}`;
               dupCount++;
            }
            ruleCoordinateMap[key] = finalRuleName;
        } else {
            finalRuleName = `Node_${key}`;
            internalNodesMap[key] = finalRuleName;
            ruleCoordinateMap[key] = finalRuleName;
        }

        extractedFormulas.push({
          _coord: key, 
          name: finalRuleName,
          rawFormula: rawFormulaValue,
          unit: 'Nos',
          isInternal: !publicRuleName,
          description: `Extracted from ${fixSheetName}!${key}`
        });
      }
    }

    // ==========================================
    // STAGE 4: DEPENDENCY RESOLUTION (EDGES)
    // ==========================================
    for (let f of extractedFormulas) {
      let resolvedFormula = f.rawFormula;
      
      const refKeys = Object.keys(ruleCoordinateMap).sort((a, b) => b.length - a.length);
      for (const refCoord of refKeys) {
        const mappedName = ruleCoordinateMap[refCoord];
        const regex = new RegExp(`\\b${refCoord}\\b`, 'g');
        const crossSheetRegex = new RegExp(`\\b${fixSheetName}!${refCoord}\\b`, 'g');
        resolvedFormula = resolvedFormula.replace(crossSheetRegex, mappedName);
        resolvedFormula = resolvedFormula.replace(regex, mappedName);
      }

      for (const [inputName, cols] of Object.entries(inputColumnMap)) {
        for (const col of cols) {
          const colRegex = new RegExp(`\\b${col}\\d+\\b`, 'g');
          resolvedFormula = resolvedFormula.replace(colRegex, inputName);
        }
      }

      if (resolvedFormula.startsWith('=')) resolvedFormula = resolvedFormula.slice(1);
      
      resolvedFormula = resolvedFormula.replace(/SUM\([^)]+\)/g, (match) => {
          for(const [inputName, cols] of Object.entries(inputColumnMap)) {
              for (const col of cols) {
                 if (match.includes(col)) return inputName;
              }
          }
          return match;
      });

      resolvedFormula = resolvedFormula.replace(/IF\([^,]+="","",([^)]+)\)/gi, '($1)');

      f.formula = resolvedFormula;
    }

    // ==========================================
    // STAGE 5: DYNAMIC MATERIAL EXTRACTION & FILTER
    // ==========================================
    if (matSheet) {
      const range = xlsx.utils.decode_range(matSheet['!ref']);
      
      // 1. Locate material columns dynamically
      let descCol = 0; // Default to A
      let qtyCol = 1;  // Default to B
      
      for (let C = range.s.c; C <= range.e.c; C++) {
        for (let R = range.s.r; R <= Math.min(range.e.r, 5); R++) {
           const cell = matSheet[xlsx.utils.encode_cell({r: R, c: C})];
           if (cell && cell.v && typeof cell.v === 'string') {
              const lower = cell.v.toLowerCase().replace(/\s/g, '');
              if (lower.includes('description') || (lower.includes('material') && !lower.includes('qty') && !lower.includes('quantity'))) descCol = C;
              if (lower.includes('qty') || lower.includes('quantity')) qtyCol = C;
           }
        }
      }
      
      if (qtyCol === 1 && descCol === 1) { // They overlapped because qty wasn't found
         qtyCol = descCol + 1;
      }

      // 2. Extract Materials
      for (let R = range.s.r; R <= range.e.r; R++) {
        const nameCell = matSheet[xlsx.utils.encode_cell({r: R, c: descCol})];
        const qtyCell = matSheet[xlsx.utils.encode_cell({r: R, c: qtyCol})];
        
        if (nameCell && nameCell.v && typeof nameCell.v === 'string') {
          const materialName = nameCell.v.trim();
          
          if (isMetadata(materialName) || materialName === '' || materialName.length < 3) {
             continue; // Clean blacklist filtering
          }

          let targetRuleName = null;
          let fixedQty = 1;

          if (qtyCell && qtyCell.f) {
            let formulaStr = qtyCell.f.replace(/\$/g, '').toUpperCase();
            const match = formulaStr.match(/!([A-Z]+[0-9]+)/);
            if (match && match[1]) {
               const refCell = match[1];
               if (ruleCoordinateMap[refCell]) targetRuleName = ruleCoordinateMap[refCell];
            } else {
               const directMatch = formulaStr.match(/([A-Z]+[0-9]+)/);
               if (directMatch && directMatch[1] && ruleCoordinateMap[directMatch[1]]) {
                 targetRuleName = ruleCoordinateMap[directMatch[1]];
               } else {
                 for (const [coord, mapped] of Object.entries(ruleCoordinateMap)) {
                   if (formulaStr.includes(coord)) {
                     targetRuleName = mapped;
                     break;
                   }
                 }
               }
            }
          } else if (qtyCell && qtyCell.v && !isNaN(qtyCell.v)) {
             fixedQty = Number(qtyCell.v);
          }

          const lowerMatName = materialName.toLowerCase();
          const HARDWARE_WHITELIST = ['handle', 'roller', 'lock', 'touch lock', 'espag', 'friction stay', 'hinge'];
          const hardwareRegex = new RegExp('\\b(' + HARDWARE_WHITELIST.join('|') + ')\\b', 'i');
          const isHardware = hardwareRegex.test(materialName);
          const category = isHardware ? 'Hardware' : (lowerMatName.includes('glass') ? 'Glass' : 'Profiles');

          if (isHardware) {
            extractedHardware.push({
               hardwareName: materialName,
               qty: fixedQty,
               formulaRef: targetRuleName
            });
          } else {
            extractedBom.push({
               materialName: materialName,
               category: category,
               unit: category === 'Glass' ? 'sqm' : (lowerMatName.includes('rubber') ? 'm' : 'Nos'),
               wastePercentage: 0,
               formulaRef: targetRuleName
            });
          }
        }
      }
    }

    const finalFormulas = extractedFormulas.map(f => ({
      name: f.name,
      formula: f.formula,
      unit: f.unit,
      isInternal: f.isInternal,
      description: f.description
    }));

    if (extractedInputs.length === 0 && finalFormulas.length === 0) {
      return defaultImport(originalName);
    }

    const publicFormulas = finalFormulas.filter(f => !f.isInternal);
    const internalFormulas = finalFormulas.filter(f => f.isInternal);
    const linkedBom = extractedBom.filter(m => m.formulaRef);
    const linkedHardware = extractedHardware.filter(h => h.formulaRef);
    
    const inputCols = extractedInputs.map(i => i.fieldName);
    if (!inputCols.includes("W.No") && !inputCols.includes("w.no")) {
       inputCols.unshift("W.No");
    }

    const linksScore = linkedBom.length > 0 ? 20 : 0;
    const accuracy = Math.min(100,
      (extractedInputs.length > 0 ? 20 : 0) + 
      (publicFormulas.length > 0 ? 25 : 0) + 
      (extractedBom.length > 0 ? 20 : 0) + 
      linksScore + 
      5 + // Hardware score
      (extractedInputs.length > 0 && publicFormulas.length > 0 ? 10 : 0)
    );

    const analysis = {
      schedule: {
        detected: extractedInputs.length > 0,
        columns: inputCols,
        columnCount: inputCols.length
      },
      rules: {
        detected: publicFormulas.length,
        items: publicFormulas.map(f => f.name)
      },
      materials: {
        detected: extractedBom.length,
        linked: linkedBom.length,
        unlinked: extractedBom.length - linkedBom.length
      },
      hardware: {
        detected: extractedHardware.length
      },
      internalNodes: {
        detected: internalFormulas.length
      },
      simulationReady: extractedInputs.length > 0 && publicFormulas.length > 0,
      accuracy
    };

    return {
      inputs: extractedInputs,
      formulas: finalFormulas,
      bom: extractedBom,
      hardware: extractedHardware,
      analysis
    };

  } catch (err) {
    console.error('Error in V4 Graph Engine Parser:', err);
    return defaultImport(originalName || filePath);
  }
};
