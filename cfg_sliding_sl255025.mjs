// SL(25)-SL(50)-SL(25) (2-track, 3-shutter, dual-glass) — Breeze small & big sash.
// Layout (rows 6..16, totals row 17, I-col totals):
//   D shutterWidth   = (B/2)+wAdd
//   E subShutterWidth= D/2
//   F shutterHeight  = C-hOff
//   L interlockHt    = F-5
//   M sashWidth      = D-110
//   N sashWidth2     = E-110
//   R glassWidth1=D-pOff  S glassHeight1=F-qOff   (big centre pane)
//   U glassWidth2=E-pOff  V glassHeight2=F-qOff   (two side panes)
//   Z sqft = CEIL(R)*CEIL(S) + CEIL(U)*CEIL(V)*2
//   I6 slFramBars=CEIL((B17+C17)*2/5850,.1)
//   I7 slSashBars=CEIL((D17*6+F17*6)/5850,.1) ; I8=I7
//   I9 interlockBars=CEIL(L17*4/5850,.1)
//   I11 sashSteel=CEIL(N17*3/2438,.1) ; I12 framSteel=0.41
//   Z17 totalSqft=SUM(Z)*2 ; Touch Lock=windowCount ; Roller=windowCount*4 ; Gas=(slSashBars*5900)/1000

const BREEZE = "E:/work files/Hari anna/test/test/Production/Breeze/Sliding/Bush Model";

function make(p) {
  const { wAdd, hOff, pOff, qOff } = p;
  const computeWindow = new Function('w', `
    const width = Number(w.width) || 0;
    const height = Number(w.height) || 0;
    const qty = Number(w.qty) || 0;
    const c = (x) => Math.ceil((x / 304.8) * 4) / 4;
    const shutterWidth = width === 0 ? 0 : width / 2 + ${wAdd};
    const subShutterWidth = shutterWidth === 0 ? 0 : shutterWidth / 2;
    const shutterHeight = height === 0 ? 0 : height - ${hOff};
    const interlockHeight = shutterHeight === 0 ? 0 : shutterHeight - 5;
    const sashWidth = shutterWidth === 0 ? 0 : shutterWidth - 110;
    const sashWidth2 = subShutterWidth === 0 ? 0 : subShutterWidth - 110;
    const glassWidth1 = shutterWidth === 0 ? 0 : shutterWidth - ${pOff};
    const glassHeight1 = shutterHeight === 0 ? 0 : shutterHeight - ${qOff};
    const glassWidth2 = subShutterWidth === 0 ? 0 : subShutterWidth - ${pOff};
    const glassHeight2 = shutterHeight === 0 ? 0 : shutterHeight - ${qOff};
    const glassNos = glassWidth1 === 0 ? 0 : 2;
    const sqft = glassWidth1 === 0 ? 0 :
      (c(glassWidth1) * c(glassHeight1)) + (c(glassWidth2) * c(glassHeight2) * 2);
    // expose a primary glass pane for the runtime glass list (cosmetic)
    const glassWidth = glassWidth1, glassHeight = glassHeight1;
    return { shutterWidth, subShutterWidth, shutterHeight, interlockHeight, sashWidth, sashWidth2,
      glassWidth1, glassHeight1, glassWidth2, glassHeight2, glassWidth, glassHeight, glassNos, sqft };
  `);
  const computeTotals = (results) => {
    const ceil1 = (x) => (x === 0 ? 0 : Math.ceil(x * 10) / 10);
    const q = (r) => Number(r.qty) || 1;
    const sW = results.reduce((a, r) => a + (Number(r.width) || 0) * q(r), 0);
    const sH = results.reduce((a, r) => a + (Number(r.height) || 0) * q(r), 0);
    const sD = results.reduce((a, r) => a + (r.shutterWidth || 0) * q(r), 0);
    const sF = results.reduce((a, r) => a + (r.shutterHeight || 0) * q(r), 0);
    const sL = results.reduce((a, r) => a + (r.interlockHeight || 0) * q(r), 0);
    const sN = results.reduce((a, r) => a + (r.sashWidth2 || 0) * q(r), 0);
    const sSq = results.reduce((a, r) => a + (r.sqft || 0) * q(r), 0);
    const windowCount = results.reduce((a, r) => a + q(r), 0);
    const slFramBars = ceil1(((sW + sH) * 2) / 5850);         // I6
    const slSashBars = ceil1((sD * 6 + sF * 6) / 5850);       // I7
    const slBeadBars = slSashBars;                             // I8
    const interlockBars = ceil1((sL * 4) / 5850);            // I9
    const sashSteel = ceil1((sN * 3) / 2438);                // I11
    const framSteel = windowCount === 0 ? 0 : 0.41;          // I12
    const totalSqft = sSq * 2;                                // Z17
    const touchLock = windowCount;
    const rollerCount = windowCount * 4;
    const gasFlatType = (slSashBars * 5900) / 1000;
    const gasZeroNonType = gasFlatType;
    return { windowCount, slFramBars, slSashBars, slBeadBars, interlockBars, sashSteel, framSteel,
      totalSqft, touchLock, rollerCount, gasFlatType, gasZeroNonType };
  };
  return { computeWindow, computeTotals };
}

const rules = [
  { key: "shutterWidth", name: "shutterWidth", formula: "IF(Width==0,0,Width/2+wAdd)" },
  { key: "subShutterWidth", name: "subShutterWidth", formula: "shutterWidth/2" },
  { key: "shutterHeight", name: "shutterHeight", formula: "IF(Height==0,0,Height-hOff)" },
  { key: "interlockHeight", name: "interlockHeight", formula: "shutterHeight-5" },
  { key: "sashWidth", name: "sashWidth", formula: "shutterWidth-110" },
  { key: "sashWidth2", name: "sashWidth2", formula: "subShutterWidth-110" },
  { key: "glassWidth1", name: "glassWidth1", formula: "shutterWidth-pOff" },
  { key: "glassHeight1", name: "glassHeight1", formula: "shutterHeight-qOff" },
  { key: "glassWidth2", name: "glassWidth2", formula: "subShutterWidth-pOff" },
  { key: "glassHeight2", name: "glassHeight2", formula: "shutterHeight-qOff" },
  { key: "sqft", name: "sqft", formula: "CEIL(g1w)*CEIL(g1h)+CEIL(g2w)*CEIL(g2h)*2" },
  { key: "slFramBars", name: "slFramBars", formula: "CEILING((SUM(Width)+SUM(Height))*2/5850,0.1)" },
  { key: "slSashBars", name: "slSashBars", formula: "CEILING((SUM(shutterWidth)*6+SUM(shutterHeight)*6)/5850,0.1)" },
  { key: "interlockBars", name: "interlockBars", formula: "CEILING(SUM(interlockHeight)*4/5850,0.1)" },
  { key: "sashSteel", name: "sashSteel", formula: "CEILING(SUM(sashWidth2)*3/2438,0.1)" },
  { key: "totalSqft", name: "totalSqft", formula: "SUM(sqft)*2" },
];
const links = {
  "60 Sliding Fram": "slFramBars",
  "60 Small Sliding Sash": "slSashBars",
  "60 Sliding Single Galzing Bead": "slBeadBars",
  "Interlockfor 60 Window": "interlockBars",
  "OP Sash (Steel)": "sashSteel",
  "Fram (Steel)": "framSteel",
  "Gas Flat Type (M)": "gasFlatType",
  'Gas "0" Non-Type (M)': "gasZeroNonType",
  "Glass (Sq.ft)": "totalSqft",
};
const extraMaterials = [
  { name: "Touch Lock(Set)", linked: "touchLock", category: "Hardware" },
  { name: "Roller(Nos)", linked: "rollerCount", category: "Hardware" },
];
const generalRows = [
  { label: "shutterWidth", key: "shutterWidth" }, { label: "subShutterWidth", key: "subShutterWidth" },
  { label: "shutterHeight", key: "shutterHeight" }, { label: "interlockHeight", key: "interlockHeight" },
  { label: "sashWidth", key: "sashWidth" }, { label: "sashWidth2", key: "sashWidth2" },
  { label: "glassWidth1", key: "glassWidth1" }, { label: "glassHeight1", key: "glassHeight1" },
  { label: "glassWidth2", key: "glassWidth2" }, { label: "glassHeight2", key: "glassHeight2" },
  { label: "glassNos", key: "glassNos" }, { label: "sqft", key: "sqft" },
];
const totalRows = [
  { label: "slFramBars", key: "slFramBars" }, { label: "slSashBars", key: "slSashBars" },
  { label: "slBeadBars", key: "slBeadBars" }, { label: "interlockBars", key: "interlockBars" },
  { label: "sashSteel", key: "sashSteel" }, { label: "framSteel", key: "framSteel" },
  { label: "totalSqft", key: "totalSqft" }, { label: "touchLock", key: "touchLock" },
  { label: "rollerCount", key: "rollerCount" }, { label: "gasFlatType", key: "gasFlatType" },
];
const SAMPLE = [{ width: 1500, height: 1200, qty: 1 }];
const winCells = { shutterWidth: 'D', subShutterWidth: 'E', shutterHeight: 'F', interlockHeight: 'L',
  sashWidth: 'M', sashWidth2: 'N', glassWidth1: 'R', glassHeight1: 'S', glassWidth2: 'U', glassHeight2: 'V', sqft: 'Z' };
const totalCells = { slFramBars: 'I6', slSashBars: 'I7', interlockBars: 'I9', sashSteel: 'I11', totalSqft: 'Z17' };

function cfg(code, fileName, compName, title, workbook, p) {
  const { computeWindow, computeTotals } = make(p);
  return {
    code, fileName, compName, title, computeWindow, computeTotals,
    rules, materialLinks: links, extraMaterials, generalRows, totalRows,
    oracle: { workbook, sheet: 'SL-SL(Big Sash)', firstRow: 6, sampleWindows: SAMPLE, winCells, totalCells },
  };
}

export const CONFIGS = [
  cfg("EXCEL-587070", "SL255025BreezeSmallSash.jsx", "SL255025BreezeSmallSash", "BREEZE-SL(25)/SL(50)/SL(25)(2T-Small Sash)",
    `${BREEZE}/SL(25)-SL(50)-SL(25) Breeze small sash.xlsx`,
    { wAdd: 11, hOff: 89, pOff: 92, qOff: 88 }),
  cfg("EXCEL-586579", "SL255025BreezeBigSash.jsx", "SL255025BreezeBigSash", "BREEZE-SL(25)/SL(50)/SL(25)(2T-Big Sash)",
    `${BREEZE}/Big Sash/SL(25)-SL(50)-SL(25) Breeze big sash.xlsx`,
    { wAdd: 26, hOff: 85, pOff: 111, qOff: 111 }),
];
