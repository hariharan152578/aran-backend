// Breeze Mullion V.Cutting (40mm) — OP-OP, OP-OP-OP, OP-OP-OP-OP.
// Verified against the live Excel-formula oracle (_xleval) by cell injection.
//
// Column map (OP-OP sheet, data rows 6..15, totals row 16):
//   D = shutterWidth  = (B/2)-39          (N panels: B/2-39, B/3-28, B/4-25)
//   E = shutterHeight = C-61              (OP-OP)  | C-58 (OP-OP-OP, OP-OP-OP-OP)
//   F = mullion A.Cut = L-72              (L = C+30)
//   L = mullionFullHt = C+30
//   M = framWidth     = B-90
//   N = sashWidth     = D-118 (OPOP) | D-115 (OP3) | D-125 (OP4)
//   glass O/Q = D-118.., R/Q.. ; sqft V/T col
//   Order totals (OP-OP): I6 opFram, I7 opBead(row17 bug->0), I8 mullionBars, I10 framSteel, I11 sashSteel, V16 totalSqft
//
// Because each variant shifts columns/rows, each gets its own compute + oracle map.

const PROD = "E:/work files/Hari anna/test/test/Production/Breeze/Open/40mm Shutter/V-Cutting";

/* ============================ OP-OP (2 panel) ============================ */
const opopComputeWindow = (w) => {
  const width = Number(w.width) || 0;
  const height = Number(w.height) || 0;
  const qty = Number(w.qty) || 0;
  const shutterWidth = width === 0 ? 0 : width / 2 - 39;     // D
  const shutterHeight = height === 0 ? 0 : height - 61;       // E
  const mullionHeight = height === 0 ? 0 : height + 30;       // L (C+30)
  const framWidth = width === 0 ? 0 : width - 90;             // M
  const sashWidth = shutterWidth === 0 ? 0 : shutterWidth - 118; // N
  const glassWidth = shutterWidth === 0 ? 0 : shutterWidth - 118;  // Q (D-118)
  const glassHeight = shutterHeight === 0 ? 0 : shutterHeight - 118; // R (E-118)
  const glassNos = glassWidth === 0 ? 0 : 2;
  const sqft = glassWidth === 0 ? 0 :
    (Math.ceil((glassWidth / 304.8) * 4) / 4) * (Math.ceil((glassHeight / 304.8) * 4) / 4);
  return { shutterWidth, shutterHeight, mullionHeight, framWidth, sashWidth, glassWidth, glassHeight, glassNos, sqft };
};
const opopComputeTotals = (results) => {
  const ceil1 = (x) => (x === 0 ? 0 : Math.ceil(x * 10) / 10);
  const q = (r) => Number(r.qty) || 1;
  const sW = results.reduce((a, r) => a + (Number(r.width) || 0) * q(r), 0);
  const sH = results.reduce((a, r) => a + (Number(r.height) || 0) * q(r), 0);
  const sSW = results.reduce((a, r) => a + (r.shutterWidth || 0) * q(r), 0);
  const sSH = results.reduce((a, r) => a + (r.shutterHeight || 0) * q(r), 0);
  const sML = results.reduce((a, r) => a + (r.mullionHeight || 0) * q(r), 0);
  const sFW = results.reduce((a, r) => a + (r.framWidth || 0) * q(r), 0);
  const sNW = results.reduce((a, r) => a + (r.sashWidth || 0) * q(r), 0);
  const sSq = results.reduce((a, r) => a + (r.sqft || 0) * q(r), 0);
  const windowCount = results.reduce((a, r) => a + q(r), 0);
  const opFramBars = ceil1(((sW + sH) * 2) / 5850);        // I6
  const opBeadBars = 0;                                     // I7: row-17 bug -> 0
  const mullionBars = ceil1(sML / 5850) + ceil1((sSW * 4 + sSH * 4) / 5850); // I8
  const framSteel = ceil1((sFW * 2 + 500) / 2438);          // I10
  const sashSteel = ceil1((sNW * 4) / 2438);                // I11
  const totalSqft = sSq * 2;                                // V16
  const espage800Count = results.filter((r) => r.shutterHeight > 845 && r.shutterHeight < 1066).length;
  const espage1000Count = results.filter((r) => r.shutterHeight > 1065 && r.shutterHeight < 1265).length;
  const fs10Count = results.filter((r) => (Number(r.width) || 0) > 760 && (Number(r.width) || 0) < 1066).length;
  const fs12Count = results.filter((r) => (Number(r.width) || 0) > 1065 && (Number(r.width) || 0) < 1301).length;
  const casmentHandel = windowCount * 2;
  const espage800 = espage800Count * 2, espage1000 = espage1000Count * 2;
  const frictionStay10 = fs10Count * 2, frictionStay12 = fs12Count * 2;
  const gasFlatType = ((opFramBars + opBeadBars + mullionBars * 2) * 5850) / 1000; // G19 uses 5850
  const gasZeroType = 0, gasZeroNonType = 0;
  return { windowCount, opFramBars, opBeadBars, mullionBars, framSteel, sashSteel, totalSqft,
    casmentHandel, espage800, espage1000, frictionStay10, frictionStay12, gasFlatType, gasZeroType, gasZeroNonType };
};

/* ========================== OP-OP-OP (3 panel) ========================== */
const op3ComputeWindow = (w) => {
  const width = Number(w.width) || 0;
  const height = Number(w.height) || 0;
  const qty = Number(w.qty) || 0;
  const shutterWidth = width === 0 ? 0 : width / 3 - 28;      // D = B/3-28
  const shutterHeight = height === 0 ? 0 : height - 58;        // E = C-58
  const mullionHeight = height === 0 ? 0 : height + 30;        // L = C+30
  const framWidth = width === 0 ? 0 : width - 90;             // M
  const sashWidth = shutterWidth === 0 ? 0 : shutterWidth - 115;  // N = D-115
  const glassWidth = shutterWidth === 0 ? 0 : shutterWidth - 118;  // R = D-118
  const glassHeight = shutterHeight === 0 ? 0 : shutterHeight - 118; // S = E-118
  const glassNos = glassWidth === 0 ? 0 : 3;
  const sqft = glassWidth === 0 ? 0 :
    (Math.ceil((glassWidth / 304.8) * 4) / 4) * (Math.ceil((glassHeight / 304.8) * 4) / 4);
  return { shutterWidth, shutterHeight, mullionHeight, framWidth, sashWidth, glassWidth, glassHeight, glassNos, sqft };
};
const op3ComputeTotals = (results) => {
  const ceil1 = (x) => (x === 0 ? 0 : Math.ceil(x * 10) / 10);
  const q = (r) => Number(r.qty) || 1;
  const sW = results.reduce((a, r) => a + (Number(r.width) || 0) * q(r), 0);
  const sH = results.reduce((a, r) => a + (Number(r.height) || 0) * q(r), 0);
  const sSW = results.reduce((a, r) => a + (r.shutterWidth || 0) * q(r), 0);
  const sSH = results.reduce((a, r) => a + (r.shutterHeight || 0) * q(r), 0);
  const sML = results.reduce((a, r) => a + (r.mullionHeight || 0) * q(r), 0);
  const sFW = results.reduce((a, r) => a + (r.framWidth || 0) * q(r), 0);
  const sNW = results.reduce((a, r) => a + (r.sashWidth || 0) * q(r), 0);
  const sSq = results.reduce((a, r) => a + (r.sqft || 0) * q(r), 0);
  const windowCount = results.reduce((a, r) => a + q(r), 0);
  const opFramBars = ceil1(((sW + sH) * 2) / 5850);          // I6
  const opBeadBars = 0;                                       // I7: row-17 bug
  // I8 = CEILING(L16*2/5850,0.1) + CEILING((D16*6+E16*6)/5850,0.1)
  const mullionBars = ceil1((sML * 2) / 5850) + ceil1((sSW * 6 + sSH * 6) / 5850);
  const framSteel = ceil1((sFW * 2 + 500) / 2438);            // I10
  const sashSteel = ceil1((sNW * 6) / 2438);                  // I11 = N16*6
  const totalSqft = sSq * 3;                                  // W16 = SUM*3
  const espage800Count = results.filter((r) => r.shutterHeight > 845 && r.shutterHeight < 1066).length;
  const espage1000Count = results.filter((r) => r.shutterHeight > 1065 && r.shutterHeight < 1265).length;
  // OP-OP-OP D21: Width>1340&<1616 ; E21: Width>1615&<2134
  const fs10Count = results.filter((r) => (Number(r.width) || 0) > 1340 && (Number(r.width) || 0) < 1616).length;
  const fs12Count = results.filter((r) => (Number(r.width) || 0) > 1615 && (Number(r.width) || 0) < 2134).length;
  const casmentHandel = windowCount * 3;
  const espage800 = espage800Count * 3, espage1000 = espage1000Count * 3;
  const frictionStay10 = fs10Count * 3, frictionStay12 = fs12Count * 3;
  // G19 = ((C5 + C7*2 + C9)*5900)/1000 where C5=I6, C7=I8, C9=I7
  const gasFlatType = ((opFramBars + (mullionBars * 2) + opBeadBars) * 5900) / 1000;
  const gasZeroType = (sashSteel * 0); // G20 = C8*5900/1000, C8=I11 sashSteel -> but that's steel; keep formula:
  const gasZeroNonType = 0;
  return { windowCount, opFramBars, opBeadBars, mullionBars, framSteel, sashSteel, totalSqft,
    casmentHandel, espage800, espage1000, frictionStay10, frictionStay12, gasFlatType, gasZeroType: 0, gasZeroNonType };
};

/* ========================= OP-OP-OP-OP (4 panel) ========================= */
// rows shifted: data 6..16, totals row 17. I6 opFram, I7 opBead, I8=I7, I9 mullion, I11 framSteel, I12 sashSteel
const op4ComputeWindow = (w) => {
  const width = Number(w.width) || 0;
  const height = Number(w.height) || 0;
  const qty = Number(w.qty) || 0;
  const shutterWidth = width === 0 ? 0 : width / 4 - 25;      // D = B/4-25
  const shutterHeight = height === 0 ? 0 : height - 58;        // E = C-58
  const mullionHeight = height === 0 ? 0 : height + 30;        // L = C+30
  const framWidth = width === 0 ? 0 : width - 90;             // M
  const sashWidth = shutterWidth === 0 ? 0 : shutterWidth - 125;  // N = D-125
  const glassWidth = shutterWidth === 0 ? 0 : shutterWidth - 125;  // R = D-125
  const glassHeight = shutterHeight === 0 ? 0 : shutterHeight - 125; // S = E-125
  const glassNos = glassWidth === 0 ? 0 : 4;
  const sqft = glassWidth === 0 ? 0 :
    (Math.ceil((glassWidth / 304.8) * 4) / 4) * (Math.ceil((glassHeight / 304.8) * 4) / 4);
  return { shutterWidth, shutterHeight, mullionHeight, framWidth, sashWidth, glassWidth, glassHeight, glassNos, sqft };
};
const op4ComputeTotals = (results) => {
  const ceil1 = (x) => (x === 0 ? 0 : Math.ceil(x * 10) / 10);
  const q = (r) => Number(r.qty) || 1;
  const sW = results.reduce((a, r) => a + (Number(r.width) || 0) * q(r), 0);
  const sH = results.reduce((a, r) => a + (Number(r.height) || 0) * q(r), 0);
  const sSW = results.reduce((a, r) => a + (r.shutterWidth || 0) * q(r), 0);
  const sSH = results.reduce((a, r) => a + (r.shutterHeight || 0) * q(r), 0);
  const sML = results.reduce((a, r) => a + (r.mullionHeight || 0) * q(r), 0);
  const sFW = results.reduce((a, r) => a + (r.framWidth || 0) * q(r), 0);
  const sNW = results.reduce((a, r) => a + (r.sashWidth || 0) * q(r), 0);
  const sSq = results.reduce((a, r) => a + (r.sqft || 0) * q(r), 0);
  const windowCount = results.reduce((a, r) => a + q(r), 0);
  const opFramBars = ceil1(((sW + sH) * 2) / 5850);          // I6 (B17+C17)
  const opBeadBars = 0;                                       // I7 row-bug; I8=I7
  const mullionBars = ceil1((sML * 2) / 5850);                // I9 = CEILING(L17*2/5850,0.1)
  const framSteel = ceil1((sFW * 2 + 500) / 2438);            // I11
  const sashSteel = ceil1((sNW * 6) / 2438);                  // I12 = N17*6
  const totalSqft = sSq * 4;                                  // W17 = SUM*4
  const espage800Count = results.filter((r) => r.shutterHeight > 845 && r.shutterHeight < 1066).length;
  const espage1000Count = results.filter((r) => r.shutterHeight > 1065 && r.shutterHeight < 1265).length;
  const fs10Count = 0, fs12Count = 0;
  const casmentHandel = windowCount * 3;
  const espage800 = espage800Count * 3, espage1000 = espage1000Count * 3;
  const frictionStay10 = 0, frictionStay12 = 0;
  const gasFlatType = ((opFramBars + (opBeadBars * 2) + opBeadBars) * 5900) / 1000;
  return { windowCount, opFramBars, opBeadBars, mullionBars, framSteel, sashSteel, totalSqft,
    casmentHandel, espage800, espage1000, frictionStay10, frictionStay12, gasFlatType, gasZeroType: 0, gasZeroNonType: 0 };
};

/* ------------------ shared rules / links / display ------------------ */
const rulesFor = (panels) => [
  { key: "shutterWidth", name: "shutterWidth", formula: `IF(Width==0,0,(Width/${panels})-${panels === 2 ? 39 : panels === 3 ? 28 : 25})` },
  { key: "shutterHeight", name: "shutterHeight", formula: `IF(Height==0,0,Height-${panels === 2 ? 61 : 58})` },
  { key: "mullionHeight", name: "mullionHeight", formula: "IF(Height==0,0,Height+30)" },
  { key: "framWidth", name: "framWidth", formula: "IF(Width==0,0,Width-90)" },
  { key: "sashWidth", name: "sashWidth", formula: `IF(shutterWidth==0,0,shutterWidth-${panels === 2 ? 118 : panels === 3 ? 115 : 125})` },
  { key: "glassWidth", name: "glassWidth", formula: `IF(shutterWidth==0,0,shutterWidth-${panels === 4 ? 125 : 118})` },
  { key: "glassHeight", name: "glassHeight", formula: `IF(shutterHeight==0,0,shutterHeight-${panels === 4 ? 125 : 118})` },
  { key: "glassNos", name: "glassNos", formula: `IF(glassWidth==0,0,${panels})` },
  { key: "sqft", name: "sqft", formula: "CEILING(glassWidth/304.8,0.25)*CEILING(glassHeight/304.8,0.25)" },
  { key: "opFramBars", name: "opFramBars", formula: "CEILING(((SUM(Width)+SUM(Height))*2/5850),0.1)" },
  { key: "mullionBars", name: "mullionBars", formula: "CEILING(mullion/5850,0.1)+CEILING(shutter*N*2/5850,0.1)" },
  { key: "framSteel", name: "framSteel", formula: "CEILING((SUM(framWidth)*2+500)/2438,0.1)" },
  { key: "sashSteel", name: "sashSteel", formula: "CEILING(SUM(sashWidth)*N/2438,0.1)" },
  { key: "totalSqft", name: "totalSqft", formula: "SUM(sqft)*2" },
];
const linksFor = {
  "60 Casement Fram": "opFramBars",
  "60 Casment Mullion": "mullionBars",
  "Fram (Steel)": "framSteel",
  "OP Sash (Steel)": "sashSteel",
  "Casment Handel (Nos)": "casmentHandel",
  "Espage 800 (Nos)": "espage800",
  "Espage 1000 (Nos)": "espage1000",
  'Friction Stay 10"': "frictionStay10",
  'Friction Stay 12"': "frictionStay12",
  "Gas Flat Type (M)": "gasFlatType",
  "Glass (Sq.ft)": "totalSqft",
};
const generalRows = [
  { label: "shutterWidth", key: "shutterWidth" }, { label: "shutterHeight", key: "shutterHeight" },
  { label: "mullionHeight", key: "mullionHeight" }, { label: "framWidth", key: "framWidth" },
  { label: "sashWidth", key: "sashWidth" }, { label: "glassWidth", key: "glassWidth" },
  { label: "glassHeight", key: "glassHeight" }, { label: "glassNos", key: "glassNos" },
  { label: "sqft", key: "sqft" },
];
const totalRows = [
  { label: "opFramBars", key: "opFramBars" }, { label: "mullionBars", key: "mullionBars" },
  { label: "framSteel", key: "framSteel" }, { label: "sashSteel", key: "sashSteel" },
  { label: "totalSqft", key: "totalSqft" }, { label: "casmentHandel", key: "casmentHandel" },
  { label: "gasFlatType", key: "gasFlatType" },
];

const SAMPLE = [{ width: 1500, height: 1200, qty: 1 }];

export const CONFIGS = [
  {
    code: "EXCEL-585665", fileName: "BreezeMullionVCutOPOP.jsx", compName: "BreezeMullionVCutOPOP",
    title: "BREEZE -(OP/OP)-(Mullion Shutter)-V.Cutting",
    computeWindow: opopComputeWindow, computeTotals: opopComputeTotals,
    rules: rulesFor(2), materialLinks: linksFor, generalRows, totalRows,
    oracle: {
      workbook: `${PROD}/Breeze Mullion V.Cutting (OP-OP).xlsx`, sheet: 'OP-OP',
      firstRow: 6, sampleWindows: SAMPLE,
      winCells: { shutterWidth: 'D', shutterHeight: 'E', mullionHeight: 'L', framWidth: 'M', sashWidth: 'N', glassWidth: 'Q', glassHeight: 'R', sqft: 'V' },
      totalCells: { opFramBars: 'I6', mullionBars: 'I8', framSteel: 'I10', sashSteel: 'I11', totalSqft: 'V16' },
    },
  },
  {
    code: "EXCEL-760903", fileName: "BreezeMullionVCutOPOPOP.jsx", compName: "BreezeMullionVCutOPOPOP",
    title: "BREEZE -OP/OP/OP-(Mullion Shutter)",
    computeWindow: op3ComputeWindow, computeTotals: op3ComputeTotals,
    rules: rulesFor(3), materialLinks: linksFor, generalRows, totalRows,
    oracle: {
      workbook: `${PROD}/Breeze Mullion V.Cutting (OP-OP-OP).xlsx`, sheet: 'OP-OP-OP',
      firstRow: 6, sampleWindows: SAMPLE,
      winCells: { shutterWidth: 'D', shutterHeight: 'E', mullionHeight: 'L', framWidth: 'M', sashWidth: 'N', glassWidth: 'R', glassHeight: 'S', sqft: 'W' },
      totalCells: { opFramBars: 'I6', mullionBars: 'I8', framSteel: 'I10', sashSteel: 'I11', totalSqft: 'W16' },
    },
  },
  {
    code: "EXCEL-760957", fileName: "BreezeMullionVCutOPOPOPOP.jsx", compName: "BreezeMullionVCutOPOPOPOP",
    title: "BREEZE-OP/OP/OP/OP-(V.Cut)Mull Shutter",
    computeWindow: op4ComputeWindow, computeTotals: op4ComputeTotals,
    rules: rulesFor(4), materialLinks: linksFor, generalRows, totalRows,
    oracle: {
      workbook: `${PROD}/Breeze Mullion V.Cutting (OP-OP-OP-OP).xlsx`, sheet: 'OP-OP-OP-OP',
      firstRow: 6, sampleWindows: SAMPLE,
      winCells: { shutterWidth: 'D', shutterHeight: 'E', mullionHeight: 'L', framWidth: 'M', sashWidth: 'N', glassWidth: 'R', glassHeight: 'S', sqft: 'W' },
      totalCells: { opFramBars: 'I6', mullionBars: 'I9', framSteel: 'I11', sashSteel: 'I12', totalSqft: 'W17' },
    },
  },
];
