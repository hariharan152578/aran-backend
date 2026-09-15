// BREEZE SL-M/SL-M (Mesh Sash Fram) — minimal sliding mesh frame.
// Main sheet only has D shutterWidth=(B-40)/2, E shutterHeight=C-103.
// Totals: H6 meshSashFramBars=CEIL((B17+C17)*2/5850,.1), H7 meshSashBars=CEIL((D17*4+E17*4)/5850,.1).
// No glass / interlock / steel on this sheet (H9,H11,H12 empty => 0).
// Profile links: "60 Sliding Fram"=H6, "60 Small Sliding Sash"=H7. Roller=count*4, Touch Lock=count.

const ROOT = "E:/work files/Hari anna/test/test/Production/Breeze/Mesh Sash Fram";

const computeWindow = new Function('w', `
  const width = Number(w.width) || 0;
  const height = Number(w.height) || 0;
  const qty = Number(w.qty) || 0;
  const shutterWidth = width === 0 ? 0 : (width - 40) / 2;
  const shutterHeight = height === 0 ? 0 : height - 103;
  const glassWidth = 0, glassHeight = 0, glassNos = 0, sqft = 0;
  return { shutterWidth, shutterHeight, glassWidth, glassHeight, glassNos, sqft };
`);
const computeTotals = (results) => {
  const ceil1 = (x) => (x === 0 ? 0 : Math.ceil(x * 10) / 10);
  const q = (r) => Number(r.qty) || 1;
  const sW = results.reduce((a, r) => a + (Number(r.width) || 0) * q(r), 0);
  const sH = results.reduce((a, r) => a + (Number(r.height) || 0) * q(r), 0);
  const sD = results.reduce((a, r) => a + (r.shutterWidth || 0) * q(r), 0);
  const sE = results.reduce((a, r) => a + (r.shutterHeight || 0) * q(r), 0);
  const windowCount = results.reduce((a, r) => a + q(r), 0);
  const meshSashFramBars = ceil1(((sW + sH) * 2) / 5850);   // H6
  const meshSashBars = ceil1((sD * 4 + sE * 4) / 5850);     // H7
  const slBeadBars = meshSashBars;                           // H8 = H7
  const totalSqft = 0;
  const touchLock = windowCount;
  const rollerCount = windowCount * 4;
  const gasFlatType = (meshSashBars * 5900) / 1000;
  const gasZeroNonType = gasFlatType;
  return { windowCount, meshSashFramBars, meshSashBars, slBeadBars, totalSqft,
    touchLock, rollerCount, gasFlatType, gasZeroNonType };
};

const rules = [
  { key: "shutterWidth", name: "shutterWidth", formula: "IF(Width==0,0,(Width-40)/2)" },
  { key: "shutterHeight", name: "shutterHeight", formula: "IF(Height==0,0,Height-103)" },
  { key: "meshSashFramBars", name: "meshSashFramBars", formula: "CEILING((SUM(Width)+SUM(Height))*2/5850,0.1)" },
  { key: "meshSashBars", name: "meshSashBars", formula: "CEILING((SUM(shutterWidth)*4+SUM(shutterHeight)*4)/5850,0.1)" },
];
const links = {
  "60 Sliding Fram": "meshSashFramBars",
  "60 Small Sliding Sash": "meshSashBars",
  "60 Sliding Single Galzing Bead": "slBeadBars",
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
];
const totalRows = [
  { label: "meshSashFramBars", key: "meshSashFramBars" }, { label: "meshSashBars", key: "meshSashBars" },
  { label: "slBeadBars", key: "slBeadBars" }, { label: "touchLock", key: "touchLock" },
  { label: "rollerCount", key: "rollerCount" }, { label: "gasFlatType", key: "gasFlatType" },
];
const SAMPLE = [{ width: 1500, height: 1200, qty: 1 }];
const winCells = { shutterWidth: 'D', shutterHeight: 'E' };
const totalCells = { meshSashFramBars: 'H6', meshSashBars: 'H7' };

export const CONFIGS = [
  {
    code: "EXCEL-123564", fileName: "SLMSLMMeshSashFram.jsx", compName: "SLMSLMMeshSashFram",
    title: "BREEZE - SL-M/SL-M(Mesh Sash Fram)", computeWindow, computeTotals,
    rules, materialLinks: links, extraMaterials, generalRows, totalRows,
    oracle: { workbook: `${ROOT}/SL-M---SL-M Baydee BREEZE sash.xlsx`, sheet: 'SL-SL(Small Sash)',
      firstRow: 6, sampleWindows: SAMPLE, winCells, totalCells },
  },
];
