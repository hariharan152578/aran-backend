// Breeze B.Door (bedroom door) family — single door-sash, hardware counted x2.
// Three variants differ ONLY by shutter offsets; totals identical.
//   D shutterWidth = B - shOffW      E shutterHeight = C - shOffH
//   K framWidth = B-90   L sashWidth = D-118   O glassWidth = D-118  P glassHeight = E-118
//   Q glassNos = 1       T sqft = ceil25(O/304.8)*ceil25(P/304.8)
//   H6 opFram = ((B16+C16)*2)/5850   H7 opBead = ((D17*4)+(E17*4))/5850 -> row17 empty -> 0
//   H8 mullion = ((D16*4)+(E16*4))/5850   H10 framSteel = ((K16*2)+500)/2438  H11 sashSteel=(L16*4)/2438
//   T16 totalSqft = SUM(T6:T15)  (no multiplier)
//   Hardware: casment=A16*2, espage/FS = *2 ; gasFlat=(H6+H7+H8*2)*5850/1000
//   gasZero = ('OP-OP'!#REF!...)  -> broken ref, replicate 0
const BD = "E:/work files/Hari anna/test/test/Production/Breeze/Open/Door/B.Door";

const mkWindow = (shOffW, shOffH) => {
  const src = `(w) => {
  const width = Number(w.width) || 0;
  const height = Number(w.height) || 0;
  const ceil25 = (x) => Math.ceil(x * 4) / 4;
  const shutterWidth = width === 0 ? 0 : width - ${shOffW};
  const shutterHeight = height === 0 ? 0 : height - ${shOffH};
  const framWidth = width === 0 ? 0 : width - 90;
  const sashWidth = shutterWidth === 0 ? 0 : shutterWidth - 118;
  const glassWidth = shutterWidth === 0 ? 0 : shutterWidth - 118;
  const glassHeight = shutterHeight === 0 ? 0 : shutterHeight - 118;
  const glassNos = glassWidth === 0 ? 0 : 1;
  const sqft = glassWidth === 0 ? 0 : ceil25(glassWidth / 304.8) * ceil25(glassHeight / 304.8);
  return { shutterWidth, shutterHeight, framWidth, sashWidth, glassWidth, glassHeight, glassNos, sqft };
}`;
  return (0, eval)(src);
};

const computeTotals = (results) => {
  const ceil1 = (x) => (x === 0 ? 0 : Math.ceil(x * 10) / 10);
  const q = (r) => Number(r.qty) || 1;
  const S = (f) => results.reduce((a, r) => a + (f(r) || 0) * q(r), 0);
  const sB = S((r) => Number(r.width) || 0), sC = S((r) => Number(r.height) || 0);
  const sD = S((r) => r.shutterWidth), sE = S((r) => r.shutterHeight);
  const sK = S((r) => r.framWidth), sL = S((r) => r.sashWidth);
  const sSq = S((r) => r.sqft);
  const windowCount = results.reduce((a, r) => a + q(r), 0);
  const opFramBars = ceil1(((sB + sC) * 2) / 5850);
  const opBeadBars = 0; // H7 row-17 bug
  const mullionBars = ceil1(((sD * 4) + (sE * 4)) / 5850); // H8
  const framSteel = ceil1((sK * 2 + 500) / 2438);
  const sashSteel = ceil1((sL * 4) / 2438);
  const totalSqft = sSq;
  const cnt = (lo, hi, f) => results.filter((r) => f(r) > lo && f(r) < hi).reduce((a, r) => a + q(r), 0);
  const espage800 = cnt(845, 1066, (r) => r.shutterHeight) * 2;
  const espage1000 = cnt(1065, 1265, (r) => r.shutterHeight) * 2;
  const frictionStay10 = cnt(760, 1066, (r) => Number(r.width) || 0) * 2;
  const frictionStay12 = cnt(1065, 1301, (r) => Number(r.width) || 0) * 2;
  const casmentHandel = windowCount * 2;
  const gasFlatType = ((opFramBars + opBeadBars + mullionBars * 2) * 5850) / 1000;
  const gasZeroType = 0; // broken #REF!
  const gasZeroNonType = 0;
  return { windowCount, opFramBars, opBeadBars, mullionBars, framSteel, sashSteel, totalSqft,
    casmentHandel, espage800, espage1000, frictionStay10, frictionStay12, gasFlatType, gasZeroType, gasZeroNonType };
};

const rules = (shOffW, shOffH) => [
  { key: "shutterWidth", name: "shutterWidth", formula: `IF(Width==0,0,Width-${shOffW})` },
  { key: "shutterHeight", name: "shutterHeight", formula: `IF(Height==0,0,Height-${shOffH})` },
  { key: "framWidth", name: "framWidth", formula: "IF(Width==0,0,Width-90)" },
  { key: "sashWidth", name: "sashWidth", formula: "IF(shutterWidth==0,0,shutterWidth-118)" },
  { key: "glassWidth", name: "glassWidth", formula: "IF(shutterWidth==0,0,shutterWidth-118)" },
  { key: "glassHeight", name: "glassHeight", formula: "IF(shutterHeight==0,0,shutterHeight-118)" },
  { key: "glassNos", name: "glassNos", formula: "IF(glassWidth==0,0,1)" },
  { key: "sqft", name: "sqft", formula: "CEILING(glassWidth/304.8,0.25)*CEILING(glassHeight/304.8,0.25)" },
  { key: "opFramBars", name: "opFramBars", formula: "CEILING(((SUM(Width)+SUM(Height))*2/5850),0.1)" },
  { key: "mullionBars", name: "mullionBars", formula: "CEILING((SUM(shutterWidth)*4+SUM(shutterHeight)*4)/5850,0.1)" },
  { key: "framSteel", name: "framSteel", formula: "CEILING((SUM(framWidth)*2+500)/2438,0.1)" },
  { key: "sashSteel", name: "sashSteel", formula: "CEILING(SUM(sashWidth)*4/2438,0.1)" },
  { key: "totalSqft", name: "totalSqft", formula: "SUM(sqft)" },
];
const links = {
  "60 Casement Fram": "opFramBars",
  "60 Casment Mullion": "mullionBars",
  "60 Single Galzing Bead": "opBeadBars",
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
  { label: "framWidth", key: "framWidth" }, { label: "sashWidth", key: "sashWidth" },
  { label: "glassWidth", key: "glassWidth" }, { label: "glassHeight", key: "glassHeight" },
  { label: "glassNos", key: "glassNos" }, { label: "sqft", key: "sqft" },
];
const totalRows = [
  { label: "opFramBars", key: "opFramBars" }, { label: "mullionBars", key: "mullionBars" },
  { label: "framSteel", key: "framSteel" }, { label: "sashSteel", key: "sashSteel" },
  { label: "totalSqft", key: "totalSqft" }, { label: "casmentHandel", key: "casmentHandel" },
  { label: "gasFlatType", key: "gasFlatType" },
];
const SAMPLE = [{ width: 900, height: 2100, qty: 1 }];
const oracleBase = (wb) => ({
  workbook: `${BD}/${wb}`, sheet: "OP-OP", firstRow: 6, sampleWindows: SAMPLE,
  winCells: { shutterWidth: "D", shutterHeight: "E", framWidth: "K", sashWidth: "L", glassWidth: "O", glassHeight: "P", sqft: "T" },
  totalCells: { opFramBars: "H6", mullionBars: "H8", framSteel: "H10", sashSteel: "H11", totalSqft: "T16" },
});

export const CONFIGS = [
  {
    code: "EXCEL-585870", fileName: "BreezeBDoorMullionWOB.jsx", compName: "BreezeBDoorMullionWOB",
    title: "BREEZE -(B.room Door)-(Mullion Shutter, W.O.Btm)",
    computeWindow: mkWindow(58, 18), computeTotals,
    rules: rules(58, 18), materialLinks: links, generalRows, totalRows,
    oracle: oracleBase("BREEZE Mullion(B.Door W.O.B).xlsx"),
  },
  {
    code: "EXCEL-526584", fileName: "BreezeBDoorOpSashWOB.jsx", compName: "BreezeBDoorOpSashWOB",
    title: "BREEZE -(Single Open)-(Op.Sash W.O.Btm)",
    computeWindow: mkWindow(60, 18), computeTotals,
    rules: rules(60, 18), materialLinks: links, generalRows, totalRows,
    oracle: oracleBase("BREEZE OP.Sash(B.Door W.O.B).xlsx"),
  },
  {
    code: "EXCEL-586018", fileName: "BreezeBDoorOpSashWithBtm.jsx", compName: "BreezeBDoorOpSashWithBtm",
    title: "BREEZE -(B.Room Door)-(Op.Sash W.Btm)",
    computeWindow: mkWindow(60, 60), computeTotals,
    rules: rules(60, 60), materialLinks: links, generalRows, totalRows,
    oracle: oracleBase("BREEZE OP.Sash(B.Door With Btm).xlsx"),
  },
];
