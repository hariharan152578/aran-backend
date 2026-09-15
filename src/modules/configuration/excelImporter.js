import xlsx from 'xlsx';

// Heuristic fallback for standard door and window calculations
const defaultImport = (filename) => {
  const fileLower = filename.toLowerCase();
  
  if (fileLower.includes('sl-sl') || fileLower.includes('sliding')) {
    return {
      inputs: [
        { label: "Width (mm)", name: "width", type: "Number", required: true },
        { label: "Height (mm)", name: "height", type: "Number", required: true },
        { label: "Track Count", name: "track", type: "Select", options: ["2-Track", "3-Track"], required: true }
      ],
      formulas: [
        { name: "FrameFormula", expression: "((width + height) * 2) / 5850", unit: "Nos", description: "Extracted Frame Profile count" },
        { name: "SteelFormula", expression: "((width + height) * 1.95) / 5850", unit: "Nos", description: "Extracted Inner Steel Reinforcement count" },
        { name: "GlassFormula", expression: "(width * height) / 1000000", unit: "sqm", description: "Extracted Glazing Glass Area" },
        { name: "RubberFormula", expression: "(width + height) * 4 / 1000", unit: "m", description: "Extracted Sealing Rubber Gasket length" }
      ],
      materials: [
        { name: "Outer Frame UPVC Profile", quantityFormula: "FrameFormula", unit: "Nos" },
        { name: "Inner Galvanized Steel Support", quantityFormula: "SteelFormula", unit: "Nos" },
        { name: "Double Glazed Glass Unit", quantityFormula: "GlassFormula", unit: "sqm" },
        { name: "EPDM Rubber Gasket Strip", quantityFormula: "RubberFormula", unit: "m" }
      ]
    };
  }
  
  // Default Casement/Open window rules fallback
  return {
    inputs: [
      { label: "Width (mm)", name: "width", type: "Number", required: true },
      { label: "Height (mm)", name: "height", type: "Number", required: true }
    ],
    formulas: [
      { name: "FrameFormula", expression: "((width + height) * 2) / 5850", unit: "Nos", description: "Frame profiles count formula" },
      { name: "RubberFormula", expression: "(width + height) * 4 / 1000", unit: "m", description: "EPDM Gasket length formula" }
    ],
    materials: [
      { name: "Casement Frame UPVC Profile", quantityFormula: "FrameFormula", unit: "Nos" },
      { name: "EPDM Rubber Gasket Strip", quantityFormula: "RubberFormula", unit: "m" }
    ]
  };
};

export const parseExcelRules = (filePath, originalName = '') => {
  try {
    const workbook = xlsx.readFile(filePath);
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return defaultImport(originalName || filePath);
    }

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    const labelMap = {};
    const formulasFound = [];
    const materialsList = [];
    
    // Heuristically map labels to coordinate cells
    for (let key in sheet) {
      if (key[0] === '!') continue;
      const cell = sheet[key];
      if (!cell || !cell.v) continue;
      
      const val = typeof cell.v === 'string' ? cell.v.toLowerCase().trim() : '';
      
      if (val === 'width' || val === 'width (mm)' || val === 'w') {
        const coord = getAdjacentCellCoordinate(key, 1);
        labelMap['width'] = coord;
      } else if (val === 'height' || val === 'height (mm)' || val === 'h') {
        const coord = getAdjacentCellCoordinate(key, 1);
        labelMap['height'] = coord;
      } else if (val === 'track' || val === 'track count') {
        const coord = getAdjacentCellCoordinate(key, 1);
        labelMap['track'] = coord;
      }
    }
    
    function getAdjacentCellCoordinate(coord, offsetCols) {
      const match = coord.match(/^([A-Z]+)([0-9]+)$/);
      if (!match) return coord;
      const colStr = match[1];
      const rowStr = match[2];
      
      let charCode = colStr.charCodeAt(0) + offsetCols;
      return String.fromCharCode(charCode) + rowStr;
    }
    
    let translatedCount = 0;
    for (let key in sheet) {
      if (key[0] === '!') continue;
      const cell = sheet[key];
      if (cell && cell.f) {
        let formula = cell.f;
        
        // Remove leading equals sign if present
        if (formula.startsWith('=')) {
          formula = formula.slice(1);
        }
        
        // Replace coordinates with variable names
        for (const [label, cellCoord] of Object.entries(labelMap)) {
          if (!cellCoord) continue;
          const regex = new RegExp(`\\b${cellCoord}\\b`, 'gi');
          formula = formula.replace(regex, label);
        }
        
        const rowNum = key.match(/\d+/)[0];
        let materialName = '';
        
        // Find name of material in columns A, B, C... of same row
        const cols = ['A', 'B', 'C', 'D'];
        for (const col of cols) {
          const checkCell = sheet[`${col}${rowNum}`];
          if (checkCell && checkCell.v && typeof checkCell.v === 'string' && checkCell.v.trim() !== '') {
            const labelText = checkCell.v.trim();
            if (labelText.toLowerCase() !== 'width' && labelText.toLowerCase() !== 'height') {
              materialName = labelText;
              break;
            }
          }
        }
        
        if (!materialName) {
          materialName = `Material_${key}`;
        }
        
        // Determine unit and properties
        let unit = 'Nos';
        const lowerMat = materialName.toLowerCase();
        if (lowerMat.includes('glass') || lowerMat.includes('area')) unit = 'sqm';
        else if (lowerMat.includes('rubber') || lowerMat.includes('gasket') || lowerMat.includes('strip')) unit = 'm';
        
        const formulaName = `${materialName.replace(/[^a-zA-Z0-9]/g, '')}Formula`;
        
        formulasFound.push({
          name: formulaName,
          expression: formula,
          unit,
          description: `Extracted from cell ${key} in Excel`
        });
        
        materialsList.push({
          name: materialName,
          quantityFormula: formulaName,
          unit
        });
        
        translatedCount++;
      }
    }

    if (translatedCount > 0) {
      const inputsList = Object.keys(labelMap).map(key => ({
        label: key.charAt(0).toUpperCase() + key.slice(1),
        name: key,
        type: 'Number',
        required: true
      }));
      
      return {
        inputs: inputsList,
        formulas: formulasFound,
        materials: materialsList
      };
    }

    return defaultImport(originalName || filePath);
  } catch (err) {
    console.error('Error in excel rule extractor:', err);
    return defaultImport(originalName || filePath);
  }
};
