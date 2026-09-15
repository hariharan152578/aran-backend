// SL-SL-Mesh (2-track + mesh shutter) sliding family — Breeze small/big, ARAN big.
// Layout (rows 6..16, totals row 17):
//   D shutterWidth=(B-wOff)/2  E shutterHeight=C-hOff
//   F meshWidth=D-fOff         G meshHeight=E-gOff
//   M interlockHt=E-5          N sashWidth=D-100
//   R glassWidth=D-pOff        S glassHeight=E-qOff   W sqft
//   Totals: J6 slFramBars=CEIL((B17+C17)*2/5850,.1)
//           J7 slSashBars=CEIL((D17*4+E17*4)/5850,.1) ; J8=J7
//           J9 interlockBars=CEIL(M17*2/5850,.1)
//           J10 meshBars=CEIL((D17*2+E17*2)/5850,.1)   (88 Sliding Insert Screen)
//           J6 also -> 88 Sliding Fram Mesh; J12 sashSteel=CEIL(N17*2/2438,.1) ; J13 framSteel=0.41
//           W17 totalSqft=SUM(W)*2
//   Hardware: Touch Lock=windowCount, Roller=windowCount*4, Gas=(slSashBars*5900)/1000

const BREEZE = "E:/work files/Hari anna/test/test/Production/Breeze/Sliding/Bush Model";
const INTACT = "E:/work files/Hari anna/test/test/Production/INTACT/Sliding/With Bush";

function makeMesh(off) {
  const { wOff, hOff, fOff, gOff, pOff, qOff } = off;
  // wExpr: how shutterWidth (D) is derived from width (default 2-track: (width-wOff)/2)
  // fExpr: how meshWidth (F) is derived (default: shutterWidth-fOff; 2.5T uses (width-8)/2)
  const wExpr = off.wExpr || `(width - ${wOff}) / 2`;
  const fExpr = off.fExpr || `shutterWidth - ${fOff}`;
  const computeWindow = new Function('w', `
    const width = Number(w.width) || 0;
    const height = Number(w.height) || 0;
    const qty = Number(w.qty) || 0;
    const shutterWidth = width === 0 ? 0 : (${wExpr});
    const shutterHeight = height === 0 ? 0 : height - ${hOff};
    const meshWidth = shutterWidth === 0 ? 0 : (${fExpr});
    const meshHeight = shutterHeight === 0 ? 0 : shutterHeight - ${gOff};
    const interlockHeight = shutterHeight === 0 ? 0 : shutterHeight - 5;
    const sashWidth = shutterWidth === 0 ? 0 : shutterWidth - 100;
    const glassWidth = shutterWidth === 0 ? 0 : shutterWidth - ${pOff};
    const glassHeight = shutterHeight === 0 ? 0 : shutterHeight - ${qOff};
    const glassNos = glassWidth === 0 ? 0 : ${off.glassNos || 2};
    const sqft = glassWidth === 0 ? 0 :
      (Math.ceil((glassWidth / 304.8) * 4) / 4) * (Math.ceil((glassHeight / 304.8) * 4) / 4);
    return { shutterWidth, shutterHeight, meshWidth, meshHeight, interlockHeight, sashWidth, glassWidth, glassHeight, glassNos, sqft };
  `);
  const computeTotals = (results) => {
    const ceil1 = (x) => (x === 0 ? 0 : Math.ceil(x * 10) / 10);
    const q = (r) => Number(r.qty) || 1;
    const sW = results.reduce((a, r) => a + (Number(r.width) || 0) * q(r), 0);
    const sH = results.reduce((a, r) => a + (Number(r.height) || 0) * q(r), 0);
    const sD = results.reduce((a, r) => a + (r.shutterWidth || 0) * q(r), 0);
    const sE = results.reduce((a, r) => a + (r.shutterHeight || 0) * q(r), 0);
    const sM = results.reduce((a, r) => a + (r.interlockHeight || 0) * q(r), 0);
    const sN = results.reduce((a, r) => a + (r.sashWidth || 0) * q(r), 0);
    const sSq = results.reduce((a, r) => a + (r.sqft || 0) * q(r), 0);
    const windowCount = results.reduce((a, r) => a + q(r), 0);
    const slMeshFramBars = ceil1(((sW + sH) * 2) / 5850);    // J6 (88 Sliding Fram Mesh)
    const slSashBars = ceil1((sD * 4 + sE * 4) / 5850);      // J7
    const slBeadBars = slSashBars;                            // J8 = J7
    const interlockBars = ceil1((sM * 2) / 5850);            // J9
    const meshScreenBars = ceil1((sD * 2 + sE * 2) / 5850);  // J10 (80-88 Insert Screen)
    const sashSteel = ceil1((sN * 2) / 2438);                // J12
    const framSteel = windowCount === 0 ? 0 : 0.41;          // J13
    const totalSqft = sSq * 2;                                // W17
    const touchLock = windowCount;
    const rollerCount = windowCount * 4;
    const gasFlatType = (slSashBars * 5900) / 1000;
    const gasZeroNonType = gasFlatType;
    return { windowCount, slMeshFramBars, slSashBars, slBeadBars, interlockBars, meshScreenBars,
      sashSteel, framSteel, totalSqft, touchLock, rollerCount, gasFlatType, gasZeroNonType };
  };
  return { computeWindow, computeTotals };
}

const rules = [
  { key: "shutterWidth", name: "shutterWidth", formula: "IF(Width==0,0,(Width-wOff)/2)" },
  { key: "shutterHeight", name: "shutterHeight", formula: "IF(Height==0,0,Height-hOff)" },
  { key: "meshWidth", name: "meshWidth", formula: "IF(shutterWidth==0,0,shutterWidth-fOff)" },
  { key: "meshHeight", name: "meshHeight", formula: "IF(shutterHeight==0,0,shutterHeight-gOff)" },
  { key: "interlockHeight", name: "interlockHeight", formula: "IF(shutterHeight==0,0,shutterHeight-5)" },
  { key: "sashWidth", name: "sashWidth", formula: "IF(shutterWidth==0,0,shutterWidth-100)" },
  { key: "glassWidth", name: "glassWidth", formula: "IF(shutterWidth==0,0,shutterWidth-pOff)" },
  { key: "glassHeight", name: "glassHeight", formula: "IF(shutterHeight==0,0,shutterHeight-qOff)" },
  { key: "glassNos", name: "glassNos", formula: "IF(glassWidth==0,0,2)" },
  { key: "sqft", name: "sqft", formula: "CEILING(glassWidth/304.8,0.25)*CEILING(glassHeight/304.8,0.25)" },
  { key: "slMeshFramBars", name: "slMeshFramBars", formula: "CEILING((SUM(Width)+SUM(Height))*2/5850,0.1)" },
  { key: "slSashBars", name: "slSashBars", formula: "CEILING((SUM(shutterWidth)*4+SUM(shutterHeight)*4)/5850,0.1)" },
  { key: "interlockBars", name: "interlockBars", formula: "CEILING(SUM(interlockHeight)*2/5850,0.1)" },
  { key: "meshScreenBars", name: "meshScreenBars", formula: "CEILING((SUM(shutterWidth)*2+SUM(shutterHeight)*2)/5850,0.1)" },
  { key: "sashSteel", name: "sashSteel", formula: "CEILING(SUM(sashWidth)*2/2438,0.1)" },
  { key: "totalSqft", name: "totalSqft", formula: "SUM(sqft)*2" },
];
const links = {
  "88 Sliding Fram Mesh": "slMeshFramBars",
  "60 Small Sliding Sash": "slSashBars",
  "60 Sliding Single Galzing Bead": "slBeadBars",
  "Interlockfor 60 Window": "interlockBars",
  "80-88 Sliding Insert Screen": "meshScreenBars",
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
  { label: "meshWidth", key: "meshWidth" }, { label: "meshHeight", key: "meshHeight" },
  { label: "interlockHeight", key: "interlockHeight" }, { label: "sashWidth", key: "sashWidth" },
  { label: "glassWidth", key: "glassWidth" }, { label: "glassHeight", key: "glassHeight" },
  { label: "glassNos", key: "glassNos" }, { label: "sqft", key: "sqft" },
];
const totalRows = [
  { label: "slMeshFramBars", key: "slMeshFramBars" }, { label: "slSashBars", key: "slSashBars" },
  { label: "interlockBars", key: "interlockBars" }, { label: "meshScreenBars", key: "meshScreenBars" },
  { label: "sashSteel", key: "sashSteel" }, { label: "framSteel", key: "framSteel" },
  { label: "totalSqft", key: "totalSqft" }, { label: "touchLock", key: "touchLock" },
  { label: "rollerCount", key: "rollerCount" }, { label: "gasFlatType", key: "gasFlatType" },
];
const SAMPLE = [{ width: 1500, height: 1200, qty: 1 }];
const winCells = { shutterWidth: 'D', shutterHeight: 'E', meshWidth: 'F', meshHeight: 'G', interlockHeight: 'M', sashWidth: 'N', glassWidth: 'R', glassHeight: 'S', sqft: 'W' };
const totalCells = { slMeshFramBars: 'J6', slSashBars: 'J7', interlockBars: 'J9', meshScreenBars: 'J10', sashSteel: 'J12', totalSqft: 'W17' };

function cfg(code, fileName, compName, title, sheet, workbook, off) {
  const { computeWindow, computeTotals } = makeMesh(off);
  return {
    code, fileName, compName, title, computeWindow, computeTotals,
    rules, materialLinks: links, extraMaterials, generalRows, totalRows,
    oracle: { workbook, sheet, firstRow: 6, sampleWindows: SAMPLE, winCells, totalCells },
  };
}

export const CONFIGS = [
  cfg("EXCEL-586999", "SLSLMeshBreezeSmallSash.jsx", "SLSLMeshBreezeSmallSash", "BREEZE-SL/SL/Mesh(Small Sash) (With Bush)",
    'SL-SL-Mesh(Small Sash)', `${BREEZE}/SL-SL-Mesh Breeze Small sash W.B.xlsx`,
    { wOff: 20, hOff: 74, fOff: 15, gOff: 2, pOff: 92, qOff: 92 }),
  cfg("EXCEL-586502", "SLSLMeshBreezeBigSash.jsx", "SLSLMeshBreezeBigSash", "BREEZE-SL/SL/Mesh(Big Sash) (With Bush)",
    'SL-SL-Mesh(Small Sash)', `${BREEZE}/Big Sash/SL-SL-Mesh Breeze Big sash W.B.xlsx`,
    { wOff: 4, hOff: 72, fOff: 15, gOff: 2, pOff: 111, qOff: 111 }),
  cfg("EXCEL-588439", "SLSLMeshARANBigSash.jsx", "SLSLMeshARANBigSash", "ARAN -SL/SL/Mesh(Big Sash) (With Bush)",
    'SL-SL-Mesh(Small Sash)', `${INTACT}/60 Series/SL-SL-Mesh ARAN Big sash W.B.xlsx`,
    { wOff: 12, hOff: 82, fOff: 0, gOff: 0, pOff: 106, qOff: 106 }),
  // SL-SL-SL-SL 2.5T,4s MESH (4-shutter; D=(B+off)/4, F=(B-8)/2, glassNos=4)
  cfg("EXCEL-587150", "SLSLSLSL25TMeshBreezeSmall.jsx", "SLSLSLSL25TMeshBreezeSmall", "BREEZE-SL/SL/SL/SL/Mesh (2T,4s Small Sash)",
    'SL-SL-Mesh(Small Sash)', `${BREEZE}/SL-SL-SL-SL 2.5T,4s MESH Breeze Small sash.xlsx`,
    { wExpr: "(width+50)/4", hOff: 74, fExpr: "(width-8)/2", gOff: 4, pOff: 92, qOff: 88, glassNos: 4 }),
  cfg("EXCEL-586643", "SLSLSLSL25TMeshBreezeBig.jsx", "SLSLSLSL25TMeshBreezeBig", "BREEZE-SL/SL/SL/SL/Mesh (2T,4s Big Sash)",
    'SL-SL-Mesh(Small Sash)', `${BREEZE}/Big Sash/SL-SL-SL-SL 2.5T,4s MESH Breeze Big sash.xlsx`,
    { wExpr: "(width+65)/4", hOff: 72, fExpr: "(width-8)/2", gOff: 3, pOff: 111, qOff: 111, glassNos: 4 }),
  // ARAN 60-series mesh variants (F=D, G=E => fOff=gOff=0; R=D-106, S=E-106)
  cfg("EXCEL-588385", "SLSLMesh3TARANBigSash.jsx", "SLSLMesh3TARANBigSash", "ARAN -SL/SL/Mesh 3T (Big Sash) (With Bush)",
    'SL-SL-Mesh(Small Sash)', `${INTACT}/60 Series/SL-SL-Mesh 3T ARAN Big sash W.B.xlsx`,
    { wOff: 12, hOff: 82, fOff: 0, gOff: 0, pOff: 106, qOff: 106 }),
  cfg("EXCEL-588502", "SLSLMeshMeshFramARANBigSash.jsx", "SLSLMeshMeshFramARANBigSash", "ARAN -SL/SL/Mesh (Mesh Fram,Big Sash) (With Bush)",
    'SL-SL-Mesh(Small Sash)', `${INTACT}/60 Series/SL-SL-Mesh Mesh Fram ARAN Big sash W.B.xlsx`,
    { wOff: 8, hOff: 83, fOff: 0, gOff: 0, pOff: 106, qOff: 106 }),
];
