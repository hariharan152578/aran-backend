// Generic linear sliding (Three-Track SL-SL-SL, Center-Lock 4-shutter, Door sash).
// Shared layout (rows 6..16, totals row 17, H-col totals):
//   D shutterWidth = <wExpr>   E shutterHeight = C-hOff
//   K interlockHt  = E-5       L sashWidth = D-lOff
//   P glassWidth   = D-pOff    Q glassHeight = E-qOff   U sqft
//   H6 slFramBars  = CEIL((B17+C17)*2/5850,.1)
//   H7 slSashBars  = CEIL((D17*sashMult+E17*sashMult)/5850,.1) ; H8=H7
//   H9 interlockBars = CEIL(K17*ilMult/5850,.1)
//   H11 sashSteel  = CEIL(L17*steelMult/2438,.1) ; H12 framSteel=0.41
//   U17 totalSqft  = SUM(U)*2
//   Hardware: Touch Lock=windowCount, Roller=windowCount*rollerMult, Gas=(slSashBars*5900)/1000

const BREEZE = "E:/work files/Hari anna/test/test/Production/Breeze/Sliding/Bush Model";
const INTACT = "E:/work files/Hari anna/test/test/Production/INTACT/Sliding/With Bush";

function makeLinear(p) {
  const { wExpr, hOff, lOff, pOff, qOff, glassNos, sashMult, ilMult, steelMult, rollerMult } = p;
  const computeWindow = new Function('w', `
    const width = Number(w.width) || 0;
    const height = Number(w.height) || 0;
    const qty = Number(w.qty) || 0;
    const shutterWidth = width === 0 ? 0 : (${wExpr});
    const shutterHeight = height === 0 ? 0 : height - ${hOff};
    const interlockHeight = shutterHeight === 0 ? 0 : shutterHeight - 5;
    const sashWidth = shutterWidth === 0 ? 0 : shutterWidth - ${lOff};
    const glassWidth = shutterWidth === 0 ? 0 : shutterWidth - ${pOff};
    const glassHeight = shutterHeight === 0 ? 0 : shutterHeight - ${qOff};
    const glassNos = glassWidth === 0 ? 0 : ${glassNos};
    const sqft = glassWidth === 0 ? 0 :
      (Math.ceil((glassWidth / 304.8) * 4) / 4) * (Math.ceil((glassHeight / 304.8) * 4) / 4);
    return { shutterWidth, shutterHeight, interlockHeight, sashWidth, glassWidth, glassHeight, glassNos, sqft };
  `);
  const computeTotals = new Function('results', `
    const ceil1 = (x) => (x === 0 ? 0 : Math.ceil(x * 10) / 10);
    const q = (r) => Number(r.qty) || 1;
    const sW = results.reduce((a, r) => a + (Number(r.width) || 0) * q(r), 0);
    const sH = results.reduce((a, r) => a + (Number(r.height) || 0) * q(r), 0);
    const sD = results.reduce((a, r) => a + (r.shutterWidth || 0) * q(r), 0);
    const sE = results.reduce((a, r) => a + (r.shutterHeight || 0) * q(r), 0);
    const sK = results.reduce((a, r) => a + (r.interlockHeight || 0) * q(r), 0);
    const sL = results.reduce((a, r) => a + (r.sashWidth || 0) * q(r), 0);
    const sSq = results.reduce((a, r) => a + (r.sqft || 0) * q(r), 0);
    const windowCount = results.reduce((a, r) => a + q(r), 0);
    const slFramBars = ceil1(((sW + sH) * 2) / 5850);
    const slSashBars = ceil1((sD * ${sashMult} + sE * ${sashMult}) / 5850);
    const slBeadBars = slSashBars;
    const interlockBars = ceil1((sK * ${ilMult}) / 5850);
    const sashSteel = ceil1((sL * ${steelMult}) / 2438);
    const framSteel = windowCount === 0 ? 0 : 0.41;
    const totalSqft = sSq * 2;
    const touchLock = windowCount;
    const rollerCount = windowCount * ${rollerMult};
    const gasFlatType = (slSashBars * 5900) / 1000;
    const gasZeroNonType = gasFlatType;
    return { windowCount, slFramBars, slSashBars, slBeadBars, interlockBars, sashSteel, framSteel,
      totalSqft, touchLock, rollerCount, gasFlatType, gasZeroNonType };
  `);
  return { computeWindow, computeTotals };
}

const rules = [
  { key: "shutterWidth", name: "shutterWidth", formula: "linear of Width" },
  { key: "shutterHeight", name: "shutterHeight", formula: "IF(Height==0,0,Height-hOff)" },
  { key: "interlockHeight", name: "interlockHeight", formula: "IF(shutterHeight==0,0,shutterHeight-5)" },
  { key: "sashWidth", name: "sashWidth", formula: "IF(shutterWidth==0,0,shutterWidth-lOff)" },
  { key: "glassWidth", name: "glassWidth", formula: "IF(shutterWidth==0,0,shutterWidth-pOff)" },
  { key: "glassHeight", name: "glassHeight", formula: "IF(shutterHeight==0,0,shutterHeight-qOff)" },
  { key: "glassNos", name: "glassNos", formula: "IF(glassWidth==0,0,N)" },
  { key: "sqft", name: "sqft", formula: "CEILING(glassWidth/304.8,0.25)*CEILING(glassHeight/304.8,0.25)" },
  { key: "slFramBars", name: "slFramBars", formula: "CEILING((SUM(Width)+SUM(Height))*2/5850,0.1)" },
  { key: "slSashBars", name: "slSashBars", formula: "CEILING((SUM(shutterWidth)*m+SUM(shutterHeight)*m)/5850,0.1)" },
  { key: "interlockBars", name: "interlockBars", formula: "CEILING(SUM(interlockHeight)*m/5850,0.1)" },
  { key: "sashSteel", name: "sashSteel", formula: "CEILING(SUM(sashWidth)*m/2438,0.1)" },
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
  { label: "shutterWidth", key: "shutterWidth" }, { label: "shutterHeight", key: "shutterHeight" },
  { label: "interlockHeight", key: "interlockHeight" }, { label: "sashWidth", key: "sashWidth" },
  { label: "glassWidth", key: "glassWidth" }, { label: "glassHeight", key: "glassHeight" },
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
const winCells = { shutterWidth: 'D', shutterHeight: 'E', interlockHeight: 'K', sashWidth: 'L', glassWidth: 'P', glassHeight: 'Q', sqft: 'U' };
const totalCells = { slFramBars: 'H6', slSashBars: 'H7', interlockBars: 'H9', sashSteel: 'H11', totalSqft: 'U17' };

function cfg(code, fileName, compName, title, sheet, workbook, p) {
  const { computeWindow, computeTotals } = makeLinear(p);
  return {
    code, fileName, compName, title, computeWindow, computeTotals,
    rules, materialLinks: links, extraMaterials, generalRows, totalRows,
    oracle: { workbook, sheet, firstRow: 6, sampleWindows: SAMPLE, winCells, totalCells },
  };
}

export const CONFIGS = [
  // Three Track SL-SL-SL (3 shutters)
  cfg("EXCEL-587282", "ThreeTrackSLSLSLBreezeSmall.jsx", "ThreeTrackSLSLSLBreezeSmall", "BREEZE -SL/SL/SL(3-T, Sml Sash) (With Bush)",
    'SL-SL(Small Sash)', `${BREEZE}/Three Track SL-SL-SL Breeze small sash W.B.xlsx`,
    { wExpr: "width/3+11", hOff: 85, lOff: 100, pOff: 92, qOff: 88, glassNos: 3, sashMult: 6, ilMult: 2, steelMult: 6, rollerMult: 4 }),
  cfg("EXCEL-586786", "ThreeTrackSLSLSLBreezeBig.jsx", "ThreeTrackSLSLSLBreezeBig", "BREEZE -SL/SL/SL(3-T, Big Sash) (With Bush)",
    'SL-SL(Big Sash)', `${BREEZE}/Big Sash/Three Track SL-SL-SL Breeze Big sash.xlsx`,
    { wExpr: "(width+42)/3", hOff: 85, lOff: 110, pOff: 111, qOff: 111, glassNos: 3, sashMult: 6, ilMult: 4, steelMult: 3, rollerMult: 4 }),
  cfg("EXCEL-588617", "ThreeTrackSLSLSLARANBig.jsx", "ThreeTrackSLSLSLARANBig", "ARAN -SL/SL/SL(3-T, Big Sash) (With Bush)",
    'SL-SL(Big Sash)', `${INTACT}/60 Series/Three Track SL-SL-SL ARAN Big sash W.B.xlsx`,
    { wExpr: "(width+53)/3", hOff: 81, lOff: 110, pOff: 106, qOff: 106, glassNos: 3, sashMult: 6, ilMult: 4, steelMult: 3, rollerMult: 4 }),
  // Center Lock 4 shutter (2T,4s)
  cfg("EXCEL-587218", "SLSLSLSLCenterLockBreezeSmall.jsx", "SLSLSLSLCenterLockBreezeSmall", "BREEZE-SL/SL/SL/SL(2T,4S Small Sash-C.Lock)",
    'SL-SL(Small Sash)', `${BREEZE}/SL-SL-SL-SL 2T,4s Breeze small sash Center Lock.xlsx`,
    { wExpr: "width/4+10", hOff: 89, lOff: 100, pOff: 92, qOff: 88, glassNos: 4, sashMult: 8, ilMult: 2, steelMult: 2, rollerMult: 8 }),
  cfg("EXCEL-586711", "SLSLSLSLCenterLockBreezeBig.jsx", "SLSLSLSLCenterLockBreezeBig", "BREEZE-SL/SL/SL/SL(2T,4S Big Sash-C.Lock)",
    'SL-SL(Small Sash)', `${BREEZE}/Big Sash/SL-SL-SL-SL (2T,4s) Breeze Big sash Center Lock.xlsx`,
    { wExpr: "width/4+16", hOff: 85, lOff: 100, pOff: 111, qOff: 111, glassNos: 4, sashMult: 8, ilMult: 2, steelMult: 2, rollerMult: 8 }),
  cfg("EXCEL-588559", "SLSLSLSLCenterLockARANBig.jsx", "SLSLSLSLCenterLockARANBig", "ARAN-SL/SL/SL/SL(2T,4S Big Sash-C.Lock)",
    'SL-SL(Small Sash)', `${INTACT}/60 Series/SL-SL-SL-SL (2T,4s) ARAN Big sash Center Lock.xlsx`,
    { wExpr: "width/4+12", hOff: 91, lOff: 100, pOff: 106, qOff: 106, glassNos: 4, sashMult: 8, ilMult: 2, steelMult: 2, rollerMult: 8 }),
  // Door sash
  cfg("EXCEL-586861", "SLSLSLSLBreezeDoorSash.jsx", "SLSLSLSLBreezeDoorSash", "BREEZE-SL/SL/SL/SL(2T,4s Door Sash)",
    'SL-SL(Big Sash)', `${BREEZE}/Door Sash/SL-SL-SL-SL(2T,4s) Breeze Door sash.xlsx`,
    { wExpr: "(width+104)/4", hOff: 87, lOff: 110, pOff: 162, qOff: 162, glassNos: 4, sashMult: 8, ilMult: 4, steelMult: 2, rollerMult: 4 }),
  cfg("EXCEL-588278", "SLSLARANDoorSash.jsx", "SLSLARANDoorSash", "ARAN -SL/SL(Door Sash) (With Bush)",
    'SL-SL(Big Sash)', `${INTACT}/60 Series/Door Sash/SL-SL ARAN Door sash.xlsx`,
    { wExpr: "(width+15)/2", hOff: 87, lOff: 110, pOff: 160, qOff: 160, glassNos: 2, sashMult: 4, ilMult: 2, steelMult: 2, rollerMult: 4 }),
  // Baydee Special Type (3T fram, 2 shutter): D=(B-29)/2, sashMult=6, ilMult=2, steelMult=6
  cfg("EXCEL-587359", "SLSL3T2SBaydeeSmallSash.jsx", "SLSL3T2SBaydeeSmallSash", "BAYDEE -SL/SL(3-T,2S Sml Sash) (With Bush)",
    'SL-SL(Small Sash)', `${BREEZE}/../../Special type/(3T fram,2S)-SL-SL Baydee small sash W.B.xlsx`,
    { wExpr: "(width-29)/2", hOff: 88, lOff: 100, pOff: 92, qOff: 88, glassNos: 2, sashMult: 6, ilMult: 2, steelMult: 6, rollerMult: 4 }),
  // Duplicate DB row (same Excel as EXCEL-587359)
  cfg("EXCEL-125128", "BreezeSpecialType3TFrame2S.jsx", "BreezeSpecialType3TFrame2S", "Breeze Special Type (3T Frame 2S)",
    'SL-SL(Small Sash)', `${BREEZE}/../../Special type/(3T fram,2S)-SL-SL Baydee small sash W.B.xlsx`,
    { wExpr: "(width-29)/2", hOff: 88, lOff: 100, pOff: 92, qOff: 88, glassNos: 2, sashMult: 6, ilMult: 2, steelMult: 6, rollerMult: 4 }),
];
