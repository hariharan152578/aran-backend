// INTACT/ARAN Open family: Single Open ARAN + V.Cutting OP-OP / OP-OP-OP / OP-OP-OP-OP.
// Verified against the live Excel-formula oracle (_xleval) by cell injection.
//
// Single Open (sheet 'Single Open', rows 6..16, totals row 17):
//   D shutterWidth=B-66  E shutterHeight=C-66  K framWidth=B-90  L sashWidth=D-125
//   O glassWidth=D-124   P glassHeight=E-124   Q nos=1  T sqft
//   H6 opFram=((B17+C17)*2)/5850  H7 opSash=((D17*2)+(E17*2))/5850  H8 opBead=H7
//   H10 framSteel=((K17*2)+500)/2438  H11 sashSteel=(L17*2)/2438  T17 totalSqft=SUM*2
//   G14 casment=A17  gasFlat=((opFram+opBead)*5900)/1000  gasZero=(opSash*5900)/1000
//
// V.Cutting (sheet 'OP-OP' / 'OP-OP-OP', rows 6..16, totals row 17):
//   D shutterWidth=B/N-(40|29|25)  E shutterHeight=C-66  L mullionHeight=C+36
//   M framWidth=B-90  N sashWidth=D-125  R glassWidth=D-124  S glassHeight=E-124  nos=N
//   I6 opFram=((B17+C17)*2)/5850  I7 opSash=((D17*K)+(E17*K))/5850 [K=4 OP-OP,6 OP3/OP4]
//   I8 opBead=I7  I9 mullion=CEILING(L17*M/5850) [M=1 OP-OP,2 OP3/OP4]
//   I11 framSteel=((M17*2)+500)/2438  I12 sashSteel=(N17*K)/2438  W17 totalSqft=SUM*N
//   gasFlat OP-OP=(I6+I8+I9*2)*5850/1000 ; OP3/4=(opFram+mullion*2+opBead)*5900/1000
//   gasZero OP-OP=I7*5850/1000 ; OP3/4=opSash*5900/1000

const INT = "E:/work files/Hari anna/test/test/Production/INTACT/Open";

/* ============================ Single Open ARAN ============================ */
// NOTE: compute functions must be SELF-CONTAINED — they are serialized via .toString()
// into the generated .jsx, so no closures / external helpers.
const soComputeWindow = (w) => {
  const width = Number(w.width) || 0;
  const height = Number(w.height) || 0;
  const ceil25 = (x) => Math.ceil(x * 4) / 4;
  const shutterWidth = width === 0 ? 0 : width - 66;
  const shutterHeight = height === 0 ? 0 : height - 66;
  const framWidth = width === 0 ? 0 : width - 90;
  const sashWidth = shutterWidth === 0 ? 0 : shutterWidth - 125;
  const glassWidth = shutterWidth === 0 ? 0 : shutterWidth - 124;
  const glassHeight = shutterHeight === 0 ? 0 : shutterHeight - 124;
  const glassNos = glassWidth === 0 ? 0 : 1;
  const sqft = glassWidth === 0 ? 0 : ceil25(glassWidth / 304.8) * ceil25(glassHeight / 304.8);
  return { shutterWidth, shutterHeight, framWidth, sashWidth, glassWidth, glassHeight, glassNos, sqft };
};
const soComputeTotals = (results) => {
  const ceil1 = (x) => (x === 0 ? 0 : Math.ceil(x * 10) / 10);
  const q = (r) => Number(r.qty) || 1;
  const S = (f) => results.reduce((a, r) => a + (f(r) || 0) * q(r), 0);
  const sB = S((r) => Number(r.width) || 0), sC = S((r) => Number(r.height) || 0);
  const sD = S((r) => r.shutterWidth), sE = S((r) => r.shutterHeight);
  const sK = S((r) => r.framWidth), sL = S((r) => r.sashWidth);
  const sSq = S((r) => r.sqft);
  const windowCount = results.reduce((a, r) => a + q(r), 0);
  const opFramBars = ceil1(((sB + sC) * 2) / 5850);
  const opSashBars = ceil1(((sD * 2) + (sE * 2)) / 5850);
  const opBeadBars = opSashBars;
  const framSteel = ceil1((sK * 2 + 500) / 2438);
  const sashSteel = ceil1((sL * 2) / 2438);
  const totalSqft = sSq * 2;
  const cnt = (lo, hi, f) => results.filter((r) => f(r) > lo && f(r) < hi).reduce((a, r) => a + q(r), 0);
  const espage800 = cnt(845, 1066, (r) => r.shutterHeight);
  const espage1000 = cnt(1065, 1265, (r) => r.shutterHeight);
  const frictionStay10 = cnt(350, 491, (r) => Number(r.width) || 0);
  const frictionStay12 = cnt(490, 641, (r) => Number(r.width) || 0);
  const frictionStay14 = cnt(640, 841, (r) => Number(r.width) || 0);
  const casmentHandel = windowCount;
  const gasFlatType = ((opFramBars + opBeadBars) * 5900) / 1000;
  const gasZeroType = (opSashBars * 5900) / 1000;
  const gasZeroNonType = gasZeroType;
  return { windowCount, opFramBars, opSashBars, opBeadBars, framSteel, sashSteel, totalSqft,
    casmentHandel, espage800, espage1000, frictionStay10, frictionStay12, frictionStay14,
    gasFlatType, gasZeroType, gasZeroNonType };
};

/* ============================ V.Cutting (N panels) ============================ */
// Self-contained factories: bake panel constants into the function body literal so the
// serialized .toString() has no free variables.
const vcutWindow = (panels, shOff) => {
  const src = `(w) => {
  const width = Number(w.width) || 0;
  const height = Number(w.height) || 0;
  const ceil25 = (x) => Math.ceil(x * 4) / 4;
  const shutterWidth = width === 0 ? 0 : width / ${panels} - ${shOff};
  const shutterHeight = height === 0 ? 0 : height - 66;
  const mullionHeight = height === 0 ? 0 : height + 36;
  const framWidth = width === 0 ? 0 : width - 90;
  const sashWidth = shutterWidth === 0 ? 0 : shutterWidth - 125;
  const glassWidth = shutterWidth === 0 ? 0 : shutterWidth - 124;
  const glassHeight = shutterHeight === 0 ? 0 : shutterHeight - 124;
  const glassNos = glassWidth === 0 ? 0 : ${panels};
  const sqft = glassWidth === 0 ? 0 : ceil25(glassWidth / 304.8) * ceil25(glassHeight / 304.8);
  return { shutterWidth, shutterHeight, mullionHeight, framWidth, sashWidth, glassWidth, glassHeight, glassNos, sqft };
}`;
  // eslint-disable-next-line no-eval
  return (0, eval)(src);
};
const vcutTotals = (panels, sashK, mullM, isOpOp) => {
  const fsLo = isOpOp ? [760, 1066] : [1340, 1616];
  const fsHi = isOpOp ? [1065, 1301] : [1615, 2134];
  const gasFlatExpr = isOpOp
    ? "((opFramBars + opBeadBars + mullionBars * 2) * 5850) / 1000"
    : "((opFramBars + mullionBars * 2 + opBeadBars) * 5900) / 1000";
  const gasZeroExpr = isOpOp ? "(opSashBars * 5850) / 1000" : "(opSashBars * 5900) / 1000";
  const src = `(results) => {
  const ceil1 = (x) => (x === 0 ? 0 : Math.ceil(x * 10) / 10);
  const q = (r) => Number(r.qty) || 1;
  const S = (f) => results.reduce((a, r) => a + (f(r) || 0) * q(r), 0);
  const sB = S((r) => Number(r.width) || 0), sC = S((r) => Number(r.height) || 0);
  const sD = S((r) => r.shutterWidth), sE = S((r) => r.shutterHeight), sL = S((r) => r.mullionHeight);
  const sM = S((r) => r.framWidth), sN = S((r) => r.sashWidth), sSq = S((r) => r.sqft);
  const windowCount = results.reduce((a, r) => a + q(r), 0);
  const opFramBars = ceil1(((sB + sC) * 2) / 5850);
  const opSashBars = ceil1(((sD * ${sashK}) + (sE * ${sashK})) / 5850);
  const opBeadBars = opSashBars;
  const mullionBars = ceil1((sL * ${mullM}) / 5850);
  const framSteel = ceil1((sM * 2 + 500) / 2438);
  const sashSteel = ceil1((sN * ${sashK}) / 2438);
  const totalSqft = sSq * ${panels};
  const cnt = (lo, hi, f) => results.filter((r) => f(r) > lo && f(r) < hi).reduce((a, r) => a + q(r), 0);
  const espage800 = cnt(845, 1066, (r) => r.shutterHeight) * ${panels};
  const espage1000 = cnt(1065, 1265, (r) => r.shutterHeight) * ${panels};
  const frictionStay10 = cnt(${fsLo[0]}, ${fsLo[1]}, (r) => Number(r.width) || 0) * ${panels};
  const frictionStay12 = cnt(${fsHi[0]}, ${fsHi[1]}, (r) => Number(r.width) || 0) * ${panels};
  const casmentHandel = windowCount * ${panels};
  const gasFlatType = ${gasFlatExpr};
  const gasZeroType = ${gasZeroExpr};
  const gasZeroNonType = gasZeroType;
  return { windowCount, opFramBars, opSashBars, opBeadBars, mullionBars, framSteel, sashSteel, totalSqft,
    casmentHandel, espage800, espage1000, frictionStay10, frictionStay12, gasFlatType, gasZeroType, gasZeroNonType };
}`;
  // eslint-disable-next-line no-eval
  return (0, eval)(src);
};

/* ------------------ shared rules / links / display ------------------ */
const soRules = [
  { key: "shutterWidth", name: "shutterWidth", formula: "IF(Width==0,0,Width-66)" },
  { key: "shutterHeight", name: "shutterHeight", formula: "IF(Height==0,0,Height-66)" },
  { key: "framWidth", name: "framWidth", formula: "IF(Width==0,0,Width-90)" },
  { key: "sashWidth", name: "sashWidth", formula: "IF(shutterWidth==0,0,shutterWidth-125)" },
  { key: "glassWidth", name: "glassWidth", formula: "IF(shutterWidth==0,0,shutterWidth-124)" },
  { key: "glassHeight", name: "glassHeight", formula: "IF(shutterHeight==0,0,shutterHeight-124)" },
  { key: "glassNos", name: "glassNos", formula: "IF(glassWidth==0,0,1)" },
  { key: "sqft", name: "sqft", formula: "CEILING(glassWidth/304.8,0.25)*CEILING(glassHeight/304.8,0.25)" },
  { key: "opFramBars", name: "opFramBars", formula: "CEILING(((SUM(Width)+SUM(Height))*2/5850),0.1)" },
  { key: "opSashBars", name: "opSashBars", formula: "CEILING((SUM(shutterWidth)*2+SUM(shutterHeight)*2)/5850,0.1)" },
  { key: "framSteel", name: "framSteel", formula: "CEILING((SUM(framWidth)*2+500)/2438,0.1)" },
  { key: "sashSteel", name: "sashSteel", formula: "CEILING(SUM(sashWidth)*2/2438,0.1)" },
  { key: "totalSqft", name: "totalSqft", formula: "SUM(sqft)*2" },
];
const vcutRules = (panels, shOff, sashK, mullM) => [
  { key: "shutterWidth", name: "shutterWidth", formula: `IF(Width==0,0,(Width/${panels})-${shOff})` },
  { key: "shutterHeight", name: "shutterHeight", formula: "IF(Height==0,0,Height-66)" },
  { key: "mullionHeight", name: "mullionHeight", formula: "IF(Height==0,0,Height+36)" },
  { key: "framWidth", name: "framWidth", formula: "IF(Width==0,0,Width-90)" },
  { key: "sashWidth", name: "sashWidth", formula: "IF(shutterWidth==0,0,shutterWidth-125)" },
  { key: "glassWidth", name: "glassWidth", formula: "IF(shutterWidth==0,0,shutterWidth-124)" },
  { key: "glassHeight", name: "glassHeight", formula: "IF(shutterHeight==0,0,shutterHeight-124)" },
  { key: "glassNos", name: "glassNos", formula: `IF(glassWidth==0,0,${panels})` },
  { key: "sqft", name: "sqft", formula: "CEILING(glassWidth/304.8,0.25)*CEILING(glassHeight/304.8,0.25)" },
  { key: "opFramBars", name: "opFramBars", formula: "CEILING(((SUM(Width)+SUM(Height))*2/5850),0.1)" },
  { key: "opSashBars", name: "opSashBars", formula: `CEILING((SUM(shutterWidth)*${sashK}+SUM(shutterHeight)*${sashK})/5850,0.1)` },
  { key: "mullionBars", name: "mullionBars", formula: `CEILING(SUM(mullionHeight)*${mullM}/5850,0.1)` },
  { key: "framSteel", name: "framSteel", formula: "CEILING((SUM(framWidth)*2+500)/2438,0.1)" },
  { key: "sashSteel", name: "sashSteel", formula: `CEILING(SUM(sashWidth)*${sashK}/2438,0.1)` },
  { key: "totalSqft", name: "totalSqft", formula: `SUM(sqft)*${panels}` },
];
const soLinks = {
  "60 Casement Fram": "opFramBars",
  "60 Outward Sash": "opSashBars",
  "60 Single Galzing Bead": "opBeadBars",
  "Fram (Steel)": "framSteel",
  "OP Sash (Steel)": "sashSteel",
  "Casment Handel (Nos)": "casmentHandel",
  "Espage 800 (Nos)": "espage800",
  "Espage 1000 (Nos)": "espage1000",
  'Friction Stay 10"': "frictionStay10",
  'Friction Stay 12"': "frictionStay12",
  'Friction Stay 14" (Set)': "frictionStay14",
  "Gas Flat Type (M)": "gasFlatType",
  'Gas "0" Type (M)': "gasZeroType",
  'Gas "0" Non-Type (M)': "gasZeroNonType",
  "Glass (Sq.ft)": "totalSqft",
};
const vcutLinks = {
  "60 Casement Fram": "opFramBars",
  "60 Casment Mullion": "mullionBars",
  "60 Outward Sash": "opSashBars",
  "60 Single Galzing Bead": "opBeadBars",
  "Fram (Steel)": "framSteel",
  "OP Sash (Steel)": "sashSteel",
  "Casment Handel (Nos)": "casmentHandel",
  "Espage 800 (Nos)": "espage800",
  "Espage 1000 (Nos)": "espage1000",
  'Friction Stay 10"': "frictionStay10",
  'Friction Stay 12"': "frictionStay12",
  "Gas Flat Type (M)": "gasFlatType",
  'Gas "0" Type (M)': "gasZeroType",
  'Gas "0" Non-Type (M)': "gasZeroNonType",
  "Glass (Sq.ft)": "totalSqft",
};
const soGeneral = [
  { label: "shutterWidth", key: "shutterWidth" }, { label: "shutterHeight", key: "shutterHeight" },
  { label: "framWidth", key: "framWidth" }, { label: "sashWidth", key: "sashWidth" },
  { label: "glassWidth", key: "glassWidth" }, { label: "glassHeight", key: "glassHeight" },
  { label: "glassNos", key: "glassNos" }, { label: "sqft", key: "sqft" },
];
const vcutGeneral = [
  { label: "shutterWidth", key: "shutterWidth" }, { label: "shutterHeight", key: "shutterHeight" },
  { label: "mullionHeight", key: "mullionHeight" }, { label: "framWidth", key: "framWidth" },
  { label: "sashWidth", key: "sashWidth" }, { label: "glassWidth", key: "glassWidth" },
  { label: "glassHeight", key: "glassHeight" }, { label: "glassNos", key: "glassNos" },
  { label: "sqft", key: "sqft" },
];
const soTotalRows = [
  { label: "opFramBars", key: "opFramBars" }, { label: "opSashBars", key: "opSashBars" },
  { label: "opBeadBars", key: "opBeadBars" }, { label: "framSteel", key: "framSteel" },
  { label: "sashSteel", key: "sashSteel" }, { label: "totalSqft", key: "totalSqft" },
  { label: "casmentHandel", key: "casmentHandel" }, { label: "gasFlatType", key: "gasFlatType" },
];
const vcutTotalRows = [
  { label: "opFramBars", key: "opFramBars" }, { label: "opSashBars", key: "opSashBars" },
  { label: "mullionBars", key: "mullionBars" }, { label: "framSteel", key: "framSteel" },
  { label: "sashSteel", key: "sashSteel" }, { label: "totalSqft", key: "totalSqft" },
  { label: "casmentHandel", key: "casmentHandel" }, { label: "gasFlatType", key: "gasFlatType" },
];

const SAMPLE = [{ width: 1500, height: 1200, qty: 1 }];

export const CONFIGS = [
  {
    code: "EXCEL-037364", fileName: "SingleOpenAranIntact.jsx", compName: "SingleOpenAranIntact",
    title: "ARAN/INTACT-(Single Open) Production",
    computeWindow: soComputeWindow, computeTotals: soComputeTotals,
    rules: soRules, materialLinks: soLinks, generalRows: soGeneral, totalRows: soTotalRows,
    oracle: {
      workbook: `${INT}/Single Open ARAN-INTACT Production.xlsx`, sheet: "Single Open",
      firstRow: 6, sampleWindows: SAMPLE,
      winCells: { shutterWidth: "D", shutterHeight: "E", framWidth: "K", sashWidth: "L", glassWidth: "O", glassHeight: "P", sqft: "T" },
      totalCells: { opFramBars: "H6", opSashBars: "H7", opBeadBars: "H8", framSteel: "H10", sashSteel: "H11", totalSqft: "T17" },
    },
  },
  {
    code: "EXCEL-037196", fileName: "OPOPVCutIntact.jsx", compName: "OPOPVCutIntact",
    title: "ARAN/INTACT-(OP/OP) V.Cutting Production",
    computeWindow: vcutWindow(2, 40), computeTotals: vcutTotals(2, 4, 1, true),
    rules: vcutRules(2, 40, 4, 1), materialLinks: vcutLinks, generalRows: vcutGeneral, totalRows: vcutTotalRows,
    oracle: {
      workbook: `${INT}/OP-OP V.Cutting INTACT Production.xlsx`, sheet: "OP-OP",
      firstRow: 6, sampleWindows: SAMPLE,
      winCells: { shutterWidth: "D", shutterHeight: "E", mullionHeight: "L", framWidth: "M", sashWidth: "N", glassWidth: "R", glassHeight: "S", sqft: "W" },
      totalCells: { opFramBars: "I6", opSashBars: "I7", opBeadBars: "I8", mullionBars: "I9", framSteel: "I11", sashSteel: "I12", totalSqft: "W17" },
    },
  },
  {
    code: "EXCEL-037061", fileName: "OPOPOPVCutIntact.jsx", compName: "OPOPOPVCutIntact",
    title: "ARAN/INTACT-(OP/OP/OP) V.Cutting Production",
    computeWindow: vcutWindow(3, 29), computeTotals: vcutTotals(3, 6, 2, false),
    rules: vcutRules(3, 29, 6, 2), materialLinks: vcutLinks, generalRows: vcutGeneral, totalRows: vcutTotalRows,
    oracle: {
      workbook: `${INT}/OP-OP-OP V.Cutting INTACT Production.xlsx`, sheet: "OP-OP-OP",
      firstRow: 6, sampleWindows: SAMPLE,
      winCells: { shutterWidth: "D", shutterHeight: "E", mullionHeight: "L", framWidth: "M", sashWidth: "N", glassWidth: "R", glassHeight: "S", sqft: "W" },
      totalCells: { opFramBars: "I6", opSashBars: "I7", opBeadBars: "I8", mullionBars: "I9", framSteel: "I11", sashSteel: "I12", totalSqft: "W17" },
    },
  },
  {
    code: "EXCEL-036911", fileName: "OPOPOPOPVCutIntact.jsx", compName: "OPOPOPOPVCutIntact",
    title: "ARAN/INTACT-(OP/OP/OP/OP) V.Cutting Production",
    computeWindow: vcutWindow(4, 25), computeTotals: vcutTotals(4, 6, 2, false),
    rules: vcutRules(4, 25, 6, 2), materialLinks: vcutLinks, generalRows: vcutGeneral, totalRows: vcutTotalRows,
    oracle: {
      workbook: `${INT}/OP-OP-OP-OP V.Cutting INTACT Production.xlsx`, sheet: "OP-OP-OP",
      firstRow: 6, sampleWindows: SAMPLE,
      winCells: { shutterWidth: "D", shutterHeight: "E", mullionHeight: "L", framWidth: "M", sashWidth: "N", glassWidth: "R", glassHeight: "S", sqft: "W" },
      totalCells: { opFramBars: "I6", opSashBars: "I7", opBeadBars: "I8", mullionBars: "I9", framSteel: "I11", sashSteel: "I12", totalSqft: "W17" },
    },
  },
];
