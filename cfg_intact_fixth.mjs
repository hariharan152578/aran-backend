// INTACT/ARAN Fix + Top-Hung V.Cutting special types (3 products, 2 DB codes each).
// Self-contained compute fns (serialized via .toString()) built with eval — no closures.
//
//  A) Fix/T.H/Fix V.Cutting (sheet 'Fix-T.H-Fix'): width split ÷3
//     D=(B/3)-29  E=C-66  L=C+36(mullionHt)  M=B-90(framW)  N=D-125(sashW)
//     R=D-119  S=E-119  nos=3  W sqft
//     I6 opFram=((B17+C17)*2)/5850  I7 opSash=((D17*2)+(E17*2))/5850  I8=I7
//     I9 mullion=(L17*2)/5850  I11 framSteel=((M17*2)+500)/2438  I12 sashSteel=(N17*6)/2438
//     W17=SUM(W)*3 ; hardware ×3 ; gas×5900
//  B) Fix/OP Horizontal V.Cutting (sheet 'OP-OP'): width split ÷2
//     D=(B/2)-40  E=C-66  M=C+36(mullionHt)  N=B-90(framW)  O=D-125(sashW)
//     S=D-119  T=E-119  nos=2  X sqft
//     J6 opFram  J7 opSash=((D17*2)+(E17*2))/5850  J8=J7  J9 mullion=(M17)/5850
//     J11 framSteel=((N17*2)+500)/2438  J12 sashSteel=(O17*4)/2438  X17=SUM(X)*2 ; ×2 ; gas×5850
//  C) Fix(B)/T.H(T) V.Cutting (sheet 'Fix-T.H'): height split (D=B-66, E=C/2-40)
//     L=B+36(mullionW)  M=B-90(framW)  N=D-120(sashW)  R=D-119  S=E-119  nos=1  W sqft
//     I7 opSash=((D17*4)+(E17*4))/5850  I9 mullion=(L17)/5850  I12 sashSteel=(N17*4)/2438
//     W17=SUM(W)*2 ; ×2 ; gas×5850
//  Friction stays: A) on B 1340-1616(FS10)/1615-2134(FS12) ; B,C) on B 760-1066/1065-1301
//  Espage: E 845-1066(800)/1065-1265(1000) ; CasmentHandel = count×mult

const ST = "E:/work files/Hari anna/test/test/Production/INTACT/Special Type";

function fixthWindow(p) {
  // p: { swExpr, shExpr, mullExpr, sashOff, nos }
  const src = `(w) => {
  const width = Number(w.width) || 0;
  const height = Number(w.height) || 0;
  const ceil25 = (x) => Math.ceil(x * 4) / 4;
  const shutterWidth = width === 0 ? 0 : (${p.swExpr});
  const shutterHeight = height === 0 ? 0 : (${p.shExpr});
  const mullionHeight = (width === 0 || height === 0) ? 0 : (${p.mullExpr});
  const framWidth = width === 0 ? 0 : width - 90;
  const sashWidth = shutterWidth === 0 ? 0 : shutterWidth - ${p.sashOff};
  const glassWidth = shutterWidth === 0 ? 0 : shutterWidth - 119;
  const glassHeight = shutterHeight === 0 ? 0 : shutterHeight - 119;
  const glassNos = glassWidth === 0 ? 0 : ${p.nos};
  const sqft = glassWidth === 0 ? 0 : ceil25(glassWidth / 304.8) * ceil25(glassHeight / 304.8);
  return { shutterWidth, shutterHeight, mullionHeight, framWidth, sashWidth, glassWidth, glassHeight, glassNos, sqft };
}`;
  return (0, eval)(src);
}

function fixthTotals(p) {
  // p: { sashK, mullM, steelK, sqftMult, hwMult, gasUnit, fs10:[lo,hi], fs12:[lo,hi] }
  const src = `(results) => {
  const ceil1 = (x) => (x === 0 ? 0 : Math.ceil(x * 10) / 10);
  const q = (r) => Number(r.qty) || 1;
  const S = (f) => results.reduce((a, r) => a + (f(r) || 0) * q(r), 0);
  const sB = S((r) => Number(r.width) || 0), sC = S((r) => Number(r.height) || 0);
  const sD = S((r) => r.shutterWidth), sE = S((r) => r.shutterHeight), sL = S((r) => r.mullionHeight);
  const sM = S((r) => r.framWidth), sN = S((r) => r.sashWidth), sSq = S((r) => r.sqft);
  const windowCount = results.reduce((a, r) => a + q(r), 0);
  const opFramBars = ceil1(((sB + sC) * 2) / 5850);
  const opSashBars = ceil1(((sD * ${p.sashK}) + (sE * ${p.sashK})) / 5850);
  const opBeadBars = opSashBars;
  const mullionBars = ceil1((sL * ${p.mullM}) / 5850);
  const framSteel = ceil1((sM * 2 + 500) / 2438);
  const sashSteel = ceil1((sN * ${p.steelK}) / 2438);
  const totalSqft = sSq * ${p.sqftMult};
  const cnt = (lo, hi, f) => results.filter((r) => f(r) > lo && f(r) < hi).reduce((a, r) => a + q(r), 0);
  const espage800 = cnt(845, 1066, (r) => r.shutterHeight) * ${p.hwMult};
  const espage1000 = cnt(1065, 1265, (r) => r.shutterHeight) * ${p.hwMult};
  const frictionStay10 = cnt(${p.fs10[0]}, ${p.fs10[1]}, (r) => Number(r.width) || 0) * ${p.hwMult};
  const frictionStay12 = cnt(${p.fs12[0]}, ${p.fs12[1]}, (r) => Number(r.width) || 0) * ${p.hwMult};
  const casmentHandel = windowCount * ${p.hwMult};
  const gasFlatType = ((opFramBars + (mullionBars * 2) + opBeadBars) * ${p.gasUnit}) / 1000;
  const gasZeroType = (opSashBars * ${p.gasUnit}) / 1000;
  const gasZeroNonType = gasZeroType;
  return { windowCount, opFramBars, opSashBars, opBeadBars, mullionBars, framSteel, sashSteel, totalSqft,
    casmentHandel, espage800, espage1000, frictionStay10, frictionStay12, gasFlatType, gasZeroType, gasZeroNonType };
}`;
  return (0, eval)(src);
}

const rulesFor = (p) => [
  { key: "shutterWidth", name: "shutterWidth", formula: `IF(Width==0,0,${p.swText})` },
  { key: "shutterHeight", name: "shutterHeight", formula: `IF(Height==0,0,${p.shText})` },
  { key: "mullionHeight", name: "mullionHeight", formula: `IF(...,0,${p.mullText})` },
  { key: "framWidth", name: "framWidth", formula: "IF(Width==0,0,Width-90)" },
  { key: "sashWidth", name: "sashWidth", formula: `IF(shutterWidth==0,0,shutterWidth-${p.sashOff})` },
  { key: "glassWidth", name: "glassWidth", formula: "IF(shutterWidth==0,0,shutterWidth-119)" },
  { key: "glassHeight", name: "glassHeight", formula: "IF(shutterHeight==0,0,shutterHeight-119)" },
  { key: "glassNos", name: "glassNos", formula: `IF(glassWidth==0,0,${p.nos})` },
  { key: "sqft", name: "sqft", formula: "CEILING(glassWidth/304.8,0.25)*CEILING(glassHeight/304.8,0.25)" },
  { key: "opFramBars", name: "opFramBars", formula: "CEILING(((SUM(Width)+SUM(Height))*2/5850),0.1)" },
  { key: "opSashBars", name: "opSashBars", formula: `CEILING((SUM(shutterWidth)*${p.sashK}+SUM(shutterHeight)*${p.sashK})/5850,0.1)` },
  { key: "mullionBars", name: "mullionBars", formula: `CEILING(SUM(mullionHeight)*${p.mullM}/5850,0.1)` },
  { key: "framSteel", name: "framSteel", formula: "CEILING((SUM(framWidth)*2+500)/2438,0.1)" },
  { key: "sashSteel", name: "sashSteel", formula: `CEILING(SUM(sashWidth)*${p.steelK}/2438,0.1)` },
  { key: "totalSqft", name: "totalSqft", formula: `SUM(sqft)*${p.sqftMult}` },
];
const links = {
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
const generalRows = [
  { label: "shutterWidth", key: "shutterWidth" }, { label: "shutterHeight", key: "shutterHeight" },
  { label: "mullionHeight", key: "mullionHeight" }, { label: "framWidth", key: "framWidth" },
  { label: "sashWidth", key: "sashWidth" }, { label: "glassWidth", key: "glassWidth" },
  { label: "glassHeight", key: "glassHeight" }, { label: "glassNos", key: "glassNos" },
  { label: "sqft", key: "sqft" },
];
const totalRows = [
  { label: "opFramBars", key: "opFramBars" }, { label: "opSashBars", key: "opSashBars" },
  { label: "mullionBars", key: "mullionBars" }, { label: "framSteel", key: "framSteel" },
  { label: "sashSteel", key: "sashSteel" }, { label: "totalSqft", key: "totalSqft" },
  { label: "casmentHandel", key: "casmentHandel" }, { label: "gasFlatType", key: "gasFlatType" },
];
const SAMPLE = [{ width: 1500, height: 1200, qty: 1 }];

// Per-product parameter packs
const A = { // Fix/T.H/Fix V.Cutting ÷3, gas×5900
  swExpr: "width / 3 - 29", shExpr: "height - 66", mullExpr: "height + 36",
  swText: "(Width/3)-29", shText: "Height-66", mullText: "Height+36",
  sashOff: 125, nos: 3, sashK: 2, mullM: 2, steelK: 6, sqftMult: 3, hwMult: 3, gasUnit: 5900,
  fs10: [1340, 1616], fs12: [1615, 2134],
  sheet: "Fix-T.H-Fix",
  winCells: { shutterWidth: "D", shutterHeight: "E", mullionHeight: "L", framWidth: "M", sashWidth: "N", glassWidth: "R", glassHeight: "S", sqft: "W" },
  totalCells: { opFramBars: "I6", opSashBars: "I7", opBeadBars: "I8", mullionBars: "I9", framSteel: "I11", sashSteel: "I12", totalSqft: "W17" },
};
const B = { // Fix/OP Horizontal V.Cutting ÷2, gas×5850
  swExpr: "width / 2 - 40", shExpr: "height - 66", mullExpr: "height + 36",
  swText: "(Width/2)-40", shText: "Height-66", mullText: "Height+36",
  sashOff: 125, nos: 2, sashK: 2, mullM: 1, steelK: 4, sqftMult: 2, hwMult: 2, gasUnit: 5850,
  fs10: [760, 1066], fs12: [1065, 1301],
  sheet: "OP-OP",
  winCells: { shutterWidth: "D", shutterHeight: "E", mullionHeight: "M", framWidth: "N", sashWidth: "O", glassWidth: "S", glassHeight: "T", sqft: "X" },
  totalCells: { opFramBars: "J6", opSashBars: "J7", opBeadBars: "J8", mullionBars: "J9", framSteel: "J11", sashSteel: "J12", totalSqft: "X17" },
};
const C = { // Fix(B)/T.H(T) V.Cutting, height split, gas×5850
  swExpr: "width - 66", shExpr: "height / 2 - 40", mullExpr: "width + 36",
  swText: "Width-66", shText: "(Height/2)-40", mullText: "Width+36",
  sashOff: 120, nos: 1, sashK: 4, mullM: 1, steelK: 4, sqftMult: 2, hwMult: 2, gasUnit: 5850,
  fs10: [760, 1066], fs12: [1065, 1301],
  sheet: "Fix-T.H",
  winCells: { shutterWidth: "D", shutterHeight: "E", mullionHeight: "L", framWidth: "M", sashWidth: "N", glassWidth: "R", glassHeight: "S", sqft: "W" },
  totalCells: { opFramBars: "I6", opSashBars: "I7", opBeadBars: "I8", mullionBars: "I9", framSteel: "I11", sashSteel: "I12", totalSqft: "W17" },
};

function cfg(code, fileName, compName, title, workbook, p) {
  return {
    code, fileName, compName, title,
    computeWindow: fixthWindow(p), computeTotals: fixthTotals(p),
    rules: rulesFor(p), materialLinks: links, generalRows, totalRows,
    oracle: { workbook, sheet: p.sheet, firstRow: 6, sampleWindows: SAMPLE, winCells: p.winCells, totalCells: p.totalCells },
  };
}

export const CONFIGS = [
  // A) Fix/T.H/Fix  (codes 588681 + 125794)
  cfg("EXCEL-588681", "FixTHFixVCutIntact.jsx", "FixTHFixVCutIntact", "INTACT/ARAN-(Fix/T.H/Fix)-V.Cutting",
    `${ST}/Fix-TH-Fix Horiz V.Cutting INTACT Production.xlsx`, A),
  cfg("EXCEL-125794", "FixTHFixVCutIntactAlt.jsx", "FixTHFixVCutIntactAlt", "INTACT Fix-TH-Fix Horizontal V.Cutting",
    `${ST}/Fix-TH-Fix Horiz V.Cutting INTACT Production.xlsx`, A),
  // B) Fix/OP Horizontal  (codes 588882 + 125816)
  cfg("EXCEL-588882", "FixTHHorizVCutIntact.jsx", "FixTHHorizVCutIntact", "INTACT/ARAN-(FIX/OP) HORIZONTAL-V.Cutting",
    `${ST}/Fix+Top Hung Horizontal V.Cutting INTACT Production.xlsx`, B),
  cfg("EXCEL-125816", "FixTHHorizVCutIntactAlt.jsx", "FixTHHorizVCutIntactAlt", "INTACT Fix+Top Hung Horizontal V.Cutting",
    `${ST}/Fix+Top Hung Horizontal V.Cutting INTACT Production.xlsx`, B),
  // C) Fix(B)/T.H(T)  (codes 589061 + 125769)
  cfg("EXCEL-589061", "FixBTHTVCutIntact.jsx", "FixBTHTVCutIntact", "INTACT-(Fix/T.H)-V.Cutting",
    `${ST}/Fix(B)+Top Hung(T) V.Cutting INTACT Production.xlsx`, C),
  cfg("EXCEL-125769", "FixBTHTVCutIntactAlt.jsx", "FixBTHTVCutIntactAlt", "INTACT Fix(B)+Top Hung(T) V.Cutting",
    `${ST}/Fix(B)+Top Hung(T) V.Cutting INTACT Production.xlsx`, C),
];
