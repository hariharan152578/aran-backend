// SL-SL (2-track, 2-shutter) sliding family — Breeze/ARAN/INTACT, small & big sash.
// Shared skeleton (sheet rows 6..16, totals row 17):
//   D shutterWidth  = (B - wOff)/2
//   E shutterHeight = C - hOff
//   K interlockHt   = E - kOff
//   L sashWidth     = D - lOff
//   P glassWidth    = D - pOff   ; Q glassHeight = E - qOff
//   sqft U = CEIL(P/304.8,.25)*CEIL(Q/304.8,.25) ; glassNos R = 2
//   Totals: H6 slFramBars=CEIL((B17+C17)*2/5850,.1)
//           H7 slSashBars=CEIL((D17*4+E17*4)/5850,.1) ; H8 slBead=H7
//           H9 interlockBars=CEIL(K17*2/5850,.1)
//           H11 sashSteel=CEIL(L17*2/2438,.1) ; H12 framSteel=0.41 (literal)
//           U17 totalSqft = SUM(U)*2
//   Hardware: Touch Lock = windowCount ; Roller = windowCount*4 ; Gas = (slSashBars*5900)/1000
import { FULL_MATERIALS } from './_gen.mjs';

const BREEZE = "E:/work files/Hari anna/test/test/Production/Breeze/Sliding/Bush Model";
const INTACT = "E:/work files/Hari anna/test/test/Production/INTACT/Sliding/With Bush";

function makeSLSL(off) {
  const { wOff, hOff, kOff, lOff, pOff, qOff } = off;
  // Build computeWindow from source text so the offsets are INLINED as literals.
  // (Closures lose free variables when the function is stringified for embedding.)
  const computeWindow = new Function('w', `
    const width = Number(w.width) || 0;
    const height = Number(w.height) || 0;
    const qty = Number(w.qty) || 0;
    const shutterWidth = width === 0 ? 0 : (width - ${wOff}) / 2;
    const shutterHeight = height === 0 ? 0 : height - ${hOff};
    const interlockHeight = shutterHeight === 0 ? 0 : shutterHeight - ${kOff};
    const sashWidth = shutterWidth === 0 ? 0 : shutterWidth - ${lOff};
    const glassWidth = shutterWidth === 0 ? 0 : shutterWidth - ${pOff};
    const glassHeight = shutterHeight === 0 ? 0 : shutterHeight - ${qOff};
    const glassNos = glassWidth === 0 ? 0 : 2;
    const sqft = glassWidth === 0 ? 0 :
      (Math.ceil((glassWidth / 304.8) * 4) / 4) * (Math.ceil((glassHeight / 304.8) * 4) / 4);
    return { shutterWidth, shutterHeight, interlockHeight, sashWidth, glassWidth, glassHeight, glassNos, sqft };
  `);
  const computeTotals = (results) => {
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
    const slFramBars = ceil1(((sW + sH) * 2) / 5850);        // H6
    const slSashBars = ceil1((sD * 4 + sE * 4) / 5850);      // H7
    const slBeadBars = slSashBars;                            // H8 = H7
    const interlockBars = ceil1((sK * 2) / 5850);            // H9
    const sashSteel = ceil1((sL * 2) / 2438);                // H11
    const framSteel = windowCount === 0 ? 0 : 0.41;          // H12 literal (per filled order)
    const totalSqft = sSq * 2;                                // U17
    const touchLock = windowCount;                            // O17
    const rollerCount = windowCount * 4;                     // O18
    const gasFlatType = (slSashBars * 5900) / 1000;          // O10 = (C14*5900)/1000, C14=H7
    const gasZeroNonType = gasFlatType;                      // O12 = same
    return { windowCount, slFramBars, slSashBars, slBeadBars, interlockBars, sashSteel, framSteel,
      totalSqft, touchLock, rollerCount, gasFlatType, gasZeroNonType };
  };
  return { computeWindow, computeTotals };
}

const rules = [
  { key: "shutterWidth", name: "shutterWidth", formula: "IF(Width==0,0,(Width-wOff)/2)" },
  { key: "shutterHeight", name: "shutterHeight", formula: "IF(Height==0,0,Height-hOff)" },
  { key: "interlockHeight", name: "interlockHeight", formula: "IF(shutterHeight==0,0,shutterHeight-kOff)" },
  { key: "sashWidth", name: "sashWidth", formula: "IF(shutterWidth==0,0,shutterWidth-lOff)" },
  { key: "glassWidth", name: "glassWidth", formula: "IF(shutterWidth==0,0,shutterWidth-pOff)" },
  { key: "glassHeight", name: "glassHeight", formula: "IF(shutterHeight==0,0,shutterHeight-qOff)" },
  { key: "glassNos", name: "glassNos", formula: "IF(glassWidth==0,0,2)" },
  { key: "sqft", name: "sqft", formula: "CEILING(glassWidth/304.8,0.25)*CEILING(glassHeight/304.8,0.25)" },
  { key: "slFramBars", name: "slFramBars", formula: "CEILING((SUM(Width)+SUM(Height))*2/5850,0.1)" },
  { key: "slSashBars", name: "slSashBars", formula: "CEILING((SUM(shutterWidth)*4+SUM(shutterHeight)*4)/5850,0.1)" },
  { key: "slBeadBars", name: "slBeadBars", formula: "slSashBars" },
  { key: "interlockBars", name: "interlockBars", formula: "CEILING(SUM(interlockHeight)*2/5850,0.1)" },
  { key: "sashSteel", name: "sashSteel", formula: "CEILING(SUM(sashWidth)*2/2438,0.1)" },
  { key: "framSteel", name: "framSteel", formula: "0.41 (per order)" },
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

function cfg(code, fileName, compName, title, sheet, workbook, off, sample = SAMPLE) {
  const { computeWindow, computeTotals } = makeSLSL(off);
  return {
    code, fileName, compName, title, computeWindow, computeTotals,
    rules, materialLinks: links, extraMaterials, generalRows, totalRows,
    oracle: { workbook, sheet, firstRow: 6, sampleWindows: sample, winCells, totalCells },
  };
}

export const CONFIGS = [
  cfg("EXCEL-586928", "SLSLBreezeSmallSash.jsx", "SLSLBreezeSmallSash", "BREEZE-SL/SL(Small Sash) (With Bush)",
    'SL-SL(Small Sash)', `${BREEZE}/SL-SL Breeze small sash W.B.xlsx`,
    { wOff: 34, hOff: 89, kOff: 5, lOff: 100, pOff: 93, qOff: 92 }),
  cfg("EXCEL-586436", "SLSLBreezeBigSash.jsx", "SLSLBreezeBigSash", "BREEZE -SL/SL(Big Sash) (With Bush)",
    'SL-SL(Big Sash)', `${BREEZE}/Big Sash/SL-SL Breeze Big sash W.B.xlsx`,
    { wOff: 24, hOff: 84, kOff: 5, lOff: 110, pOff: 111, qOff: 111 }),
  cfg("EXCEL-588333", "SLSLARANBigSash.jsx", "SLSLARANBigSash", "ARAN -SL/SL(Big Sash) (With Bush)",
    'SL-SL(Big Sash)', `${INTACT}/60 Series/SL-SL ARAN Big sash W.B.xlsx`,
    { wOff: 32, hOff: 90, kOff: 5, lOff: 110, pOff: 106, qOff: 106 }),
  cfg("EXCEL-588206", "SLSLSilmINTACTSmallSash.jsx", "SLSLSilmINTACTSmallSash", "INTACT Silm -SL/SL(Small Sash, With Bush)",
    'SL-SL(Small Sash)', `${INTACT}/50 Series/SL-SL Silm INTACT Small sash W.B.xlsx`,
    { wOff: 14, hOff: 72, kOff: 8, lOff: 100, pOff: 92, qOff: 88 }),
];
