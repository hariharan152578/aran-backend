// Breeze Double Door family — STUB workbooks (single 'OP-OP' sheet, A1:I18).
// Only shutter dims + 3 bar totals exist; no glass / steel / hardware / Profile sheet.
// Reproduced faithfully: more would be invention.
//   D shutterWidth = (B/2) - shOffW    E shutterHeight = C - shOffH
//   H6 opFram = ((B17+C17)*2)/5850     H7 opSash = ((D17*4)+(E17*4))/5850   H8 opBead = H7
const DD = "E:/work files/Hari anna/test/test/Production/Breeze/Open/Door/Double Door";

const mkWindow = (shOffW, shOffH) => {
  const src = `(w) => {
  const width = Number(w.width) || 0;
  const height = Number(w.height) || 0;
  const shutterWidth = width === 0 ? 0 : (width / 2) - ${shOffW};
  const shutterHeight = height === 0 ? 0 : height - ${shOffH};
  return { shutterWidth, shutterHeight, glassWidth: 0, glassHeight: 0, glassNos: 0, sqft: 0 };
}`;
  return (0, eval)(src);
};

const computeTotals = (results) => {
  const ceil1 = (x) => (x === 0 ? 0 : Math.ceil(x * 10) / 10);
  const q = (r) => Number(r.qty) || 1;
  const S = (f) => results.reduce((a, r) => a + (f(r) || 0) * q(r), 0);
  const sB = S((r) => Number(r.width) || 0), sC = S((r) => Number(r.height) || 0);
  const sD = S((r) => r.shutterWidth), sE = S((r) => r.shutterHeight);
  const windowCount = results.reduce((a, r) => a + q(r), 0);
  const opFramBars = ceil1(((sB + sC) * 2) / 5850);
  const opSashBars = ceil1(((sD * 4) + (sE * 4)) / 5850);
  const opBeadBars = opSashBars;
  return { windowCount, opFramBars, opSashBars, opBeadBars };
};

const rules = (shOffW, shOffH) => [
  { key: "shutterWidth", name: "shutterWidth", formula: `IF(Width==0,0,(Width/2)-${shOffW})` },
  { key: "shutterHeight", name: "shutterHeight", formula: `IF(Height==0,0,Height-${shOffH})` },
  { key: "opFramBars", name: "opFramBars", formula: "CEILING(((SUM(Width)+SUM(Height))*2/5850),0.1)" },
  { key: "opSashBars", name: "opSashBars", formula: "CEILING((SUM(shutterWidth)*4+SUM(shutterHeight)*4)/5850,0.1)" },
  { key: "opBeadBars", name: "opBeadBars", formula: "opSashBars (= H8 mirrors H7)" },
];
const links = {
  "60 Casement Fram": "opFramBars",
  "60 Outward Door Sash A": "opSashBars",
  "60 Single Galzing Bead": "opBeadBars",
};
const generalRows = [
  { label: "shutterWidth", key: "shutterWidth" }, { label: "shutterHeight", key: "shutterHeight" },
];
const totalRows = [
  { label: "opFramBars", key: "opFramBars" }, { label: "opSashBars", key: "opSashBars" },
  { label: "opBeadBars", key: "opBeadBars" },
];
const SAMPLE = [{ width: 1500, height: 2100, qty: 1 }];
const oracleBase = (wb) => ({
  workbook: `${DD}/${wb}`, sheet: "OP-OP", firstRow: 6, sampleWindows: SAMPLE,
  winCells: { shutterWidth: "D", shutterHeight: "E" },
  totalCells: { opFramBars: "H6", opSashBars: "H7", opBeadBars: "H8" },
});

export const CONFIGS = [
  {
    code: "EXCEL-586212", fileName: "BreezeDDoorWOBBead.jsx", compName: "BreezeDDoorWOBBead",
    title: "BREEZE D.Door-(W.O.B Btm Bead)",
    computeWindow: mkWindow(36, 40), computeTotals,
    rules: rules(36, 40), materialLinks: links, generalRows, totalRows,
    oracle: oracleBase("BREEZE D.Door W.O.Bottom Bottom Bead.xlsx"),
  },
  {
    code: "EXCEL-586234", fileName: "BreezeDDoorWOBRibCut.jsx", compName: "BreezeDDoorWOBRibCut",
    title: "BREEZE D.Door-(W.O.B Rib Cut)",
    computeWindow: mkWindow(32, 20), computeTotals,
    rules: rules(32, 20), materialLinks: links, generalRows, totalRows,
    oracle: oracleBase("BREEZE D.Door W.O.Bottom Rib Cut.xlsx"),
  },
  {
    code: "EXCEL-586175", fileName: "BreezeDDoorWithBtmDoorSash.jsx", compName: "BreezeDDoorWithBtmDoorSash",
    title: "BREEZE D.Door-(With Btm, Door Sash)",
    computeWindow: mkWindow(36, 60), computeTotals,
    rules: rules(36, 60), materialLinks: links, generalRows, totalRows,
    oracle: oracleBase("BREEZE D.Door With Bottom Door sash.xlsx"),
  },
  {
    code: "EXCEL-586193", fileName: "BreezeDDoorWithBtmWindowSash.jsx", compName: "BreezeDDoorWithBtmWindowSash",
    title: "BREEZE D.Door-(With.Btm, Window Sash)",
    computeWindow: mkWindow(32, 60), computeTotals,
    rules: rules(32, 60), materialLinks: links, generalRows, totalRows,
    oracle: oracleBase("BREEZE D.Door With Bottom Window sash.xlsx"),
  },
];
