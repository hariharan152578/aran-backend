// Fixed / Louver family — all share the FIX/Louver sheet formula.
// Fixed:  opBeadCut = Width/2 - 37 (per window)
//         fixFrameBars = CEILING((ΣWidth+ΣHeight)*2/5850, 0.1)   [qty-expanded]
//         opBeadBars  = fixFrameBars
// Louver: only fixFrameBars (no bead, no beadCut)

const ceil1 = (x) => (x === 0 ? 0 : Math.ceil(x * 10) / 10);

// ---- Fixed ----
const fixedComputeWindow = (w) => {
  const width = Number(w.width) || 0;
  const height = Number(w.height) || 0;
  const qty = Number(w.qty) || 0;
  const opBeadCut = width === 0 ? 0 : width / 2 - 37;
  return { width, height, qty, opBeadCut };
};
const fixedComputeTotals = (results) => {
  const ceil1 = (x) => (x === 0 ? 0 : Math.ceil(x * 10) / 10);
  const sumW = results.reduce((a, r) => a + (Number(r.width) || 0) * (Number(r.qty) || 0), 0);
  const sumH = results.reduce((a, r) => a + (Number(r.height) || 0) * (Number(r.qty) || 0), 0);
  const fixFrameBars = ceil1(((sumW + sumH) * 2) / 5850);
  const opBeadBars = fixFrameBars;
  return { fixFrameBars, opBeadBars };
};

// ---- Louver ----
const louverComputeWindow = (w) => {
  const width = Number(w.width) || 0;
  const height = Number(w.height) || 0;
  const qty = Number(w.qty) || 0;
  return { width, height, qty };
};
const louverComputeTotals = (results) => {
  const ceil1 = (x) => (x === 0 ? 0 : Math.ceil(x * 10) / 10);
  const sumW = results.reduce((a, r) => a + (Number(r.width) || 0) * (Number(r.qty) || 0), 0);
  const sumH = results.reduce((a, r) => a + (Number(r.height) || 0) * (Number(r.qty) || 0), 0);
  const fixFrameBars = ceil1(((sumW + sumH) * 2) / 5850);
  return { fixFrameBars };
};

const fixedRules = [
  { key: "opBeadCut", name: "opBeadCut", formula: "IF(Width==0, 0, (Width / 2) - 37)" },
  { key: "fixFrameBars", name: "fixFrameBars", formula: "CEILING((((SUM(Width)+SUM(Height)) * 2) / 5850), 0.1)" },
  { key: "opBeadBars", name: "opBeadBars", formula: "fixFrameBars (= H7 mirrors H6)" },
];
const louverRules = [
  { key: "fixFrameBars", name: "fixFrameBars", formula: "CEILING((((SUM(Width)+SUM(Height)) * 2) / 5850), 0.1)" },
];

const fixedLinks = { "60 Small Casment Fram": "fixFrameBars", "60 Single Galzing Bead": "opBeadBars" };
const louverLinks = { "60 Small Casment Fram": "fixFrameBars" };

const fixedGeneral = [{ label: "opBeadCut", key: "opBeadCut" }];
const louverGeneral = [];
const fixedTotals = [{ label: "fixFrameBars", key: "fixFrameBars" }, { label: "opBeadBars", key: "opBeadBars" }];
const louverTotals = [{ label: "fixFrameBars", key: "fixFrameBars" }];

const fixedVerify = {
  windows: [{ id: 1, wno: "W1", width: 929, height: 259, qty: 1 }],
  expectWindow: [{ opBeadCut: 427.5 }],
  expectTotals: { fixFrameBars: 0.5, opBeadBars: 0.5 },
};
const fixedINTACTVerify = {
  windows: [{ id: 1, wno: "W1", width: 609, height: 2126, qty: 1 }],
  expectWindow: [{ opBeadCut: 267.5 }],
  expectTotals: { fixFrameBars: 1, opBeadBars: 1 },
};
const louverVerify = {
  windows: [{ id: 1, wno: "W1", width: 929, height: 259, qty: 1 }],
  expectTotals: { fixFrameBars: 0.5 },
};

function fixedCfg(code, fileName, compName, title, verify) {
  return { code, fileName, compName, title,
    computeWindow: fixedComputeWindow, computeTotals: fixedComputeTotals,
    rules: fixedRules, materialLinks: fixedLinks, generalRows: fixedGeneral, totalRows: fixedTotals, verify };
}
function louverCfg(code, fileName, compName, title, verify) {
  return { code, fileName, compName, title,
    computeWindow: louverComputeWindow, computeTotals: louverComputeTotals,
    rules: louverRules, materialLinks: louverLinks, generalRows: louverGeneral, totalRows: louverTotals, verify };
}

export const CONFIGS = [
  fixedCfg("EXCEL-694076", "BreezeFixedWindowAlt.jsx", "BreezeFixedWindowAlt", "Breeze Fixed Window", fixedVerify),
  fixedCfg("EXCEL-035969", "FixedBreezeSampleData.jsx", "FixedBreezeSampleData", "Fixed Breeze Production [Sample data]", fixedVerify),
  fixedCfg("EXCEL-036081", "FixedBreezeTemplate.jsx", "FixedBreezeTemplate", "Fixed Breeze Production [Template]", fixedVerify),
  fixedCfg("EXCEL-587446", "FixedINTACTProduction.jsx", "FixedINTACTProduction", "Fixed INTACT Production", fixedINTACTVerify),
  fixedCfg("EXCEL-125215", "INTACTFixedWindow.jsx", "INTACTFixedWindow", "INTACT Fixed Window", fixedINTACTVerify),
  louverCfg("EXCEL-587486", "LouverINTACTProduction.jsx", "LouverINTACTProduction", "Louver INTACT Production", louverVerify),
  louverCfg("EXCEL-125260", "INTACTLouverProduction.jsx", "INTACTLouverProduction", "INTACT Louver Production", louverVerify),
];
