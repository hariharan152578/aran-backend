// Single Open Door & Window Sash family.
// Group A (4 full Door files, sheet 'Single Open Door Without Bottom', stub — no glass/steel):
//   D shutterWidth=B-shW  E shutterHeight=C-shH
//   H6 opFram=((B17+C17)*2)/5850  H7 opSash=((D17*2)+(E17*2))/5850  H8 opBead=H7  H9 opMul=D17/5850
// Group B (2 Window Sash stubs, sheet 'Single Open', A1:M18):
//   D shutterWidth=B-60  E shutterHeight=C-shH  K framWidth=C-90  L sashWidth=E-125
//   H6 opFram  H7 opSash  H8 opBead=H7  H10 framSteel=((K17*2)+500)/2438  H11 sashSteel=(L17*2)/2438

const DOOR = "E:/work files/Hari anna/test/test/Production/Breeze/Open/Door";
const ARAN = "E:/work files/Hari anna/test/test/Production/INTACT/Open/Door/Door Sash";

/* ---------- Group A: full Door (4 bars, no glass/steel) ---------- */
const doorWindow = (shW, shH) => {
  const src = `(w) => {
  const width = Number(w.width) || 0;
  const height = Number(w.height) || 0;
  const shutterWidth = width === 0 ? 0 : width - ${shW};
  const shutterHeight = height === 0 ? 0 : height - ${shH};
  return { shutterWidth, shutterHeight, glassWidth: 0, glassHeight: 0, glassNos: 0, sqft: 0 };
}`;
  return (0, eval)(src);
};
const doorTotals = (results) => {
  const ceil1 = (x) => (x === 0 ? 0 : Math.ceil(x * 10) / 10);
  const q = (r) => Number(r.qty) || 1;
  const S = (f) => results.reduce((a, r) => a + (f(r) || 0) * q(r), 0);
  const sB = S((r) => Number(r.width) || 0), sC = S((r) => Number(r.height) || 0);
  const sD = S((r) => r.shutterWidth), sE = S((r) => r.shutterHeight);
  const windowCount = results.reduce((a, r) => a + q(r), 0);
  const opFramBars = ceil1(((sB + sC) * 2) / 5850);
  const opSashBars = ceil1(((sD * 2) + (sE * 2)) / 5850);
  const opBeadBars = opSashBars;
  const opMulBars = ceil1(sD / 5850);
  return { windowCount, opFramBars, opSashBars, opBeadBars, opMulBars };
};
const doorRules = (shW, shH) => [
  { key: "shutterWidth", name: "shutterWidth", formula: `IF(Width==0,0,Width-${shW})` },
  { key: "shutterHeight", name: "shutterHeight", formula: `IF(Height==0,0,Height-${shH})` },
  { key: "opFramBars", name: "opFramBars", formula: "CEILING(((SUM(Width)+SUM(Height))*2/5850),0.1)" },
  { key: "opSashBars", name: "opSashBars", formula: "CEILING((SUM(shutterWidth)*2+SUM(shutterHeight)*2)/5850,0.1)" },
  { key: "opBeadBars", name: "opBeadBars", formula: "opSashBars (= H8 mirrors H7)" },
  { key: "opMulBars", name: "opMulBars", formula: "CEILING(SUM(shutterWidth)/5850,0.1)" },
];
const doorLinks = {
  "60 Casement Fram": "opFramBars",
  "60 Outward Door Sash A": "opSashBars",
  "60 Single Galzing Bead": "opBeadBars",
  "60 Casment Mullion": "opMulBars",
};
const doorGeneral = [
  { label: "shutterWidth", key: "shutterWidth" }, { label: "shutterHeight", key: "shutterHeight" },
];
const doorTotalRows = [
  { label: "opFramBars", key: "opFramBars" }, { label: "opSashBars", key: "opSashBars" },
  { label: "opBeadBars", key: "opBeadBars" }, { label: "opMulBars", key: "opMulBars" },
];
const doorOracle = (base, wb, sheet) => ({
  workbook: `${base}/${wb}`, sheet, firstRow: 6, sampleWindows: [{ width: 900, height: 2100, qty: 1 }],
  winCells: { shutterWidth: "D", shutterHeight: "E" },
  totalCells: { opFramBars: "H6", opSashBars: "H7", opBeadBars: "H8", opMulBars: "H9" },
});
const doorCfg = (code, file, comp, title, shW, shH, base, wb) => ({
  code, fileName: file, compName: comp, title,
  computeWindow: doorWindow(shW, shH), computeTotals: doorTotals,
  rules: doorRules(shW, shH), materialLinks: doorLinks, generalRows: doorGeneral, totalRows: doorTotalRows,
  oracle: doorOracle(base, wb, "Single Open Door Without Bottom"),
});

/* ---------- Group B: Window Sash (fram+sash steel, no glass) ---------- */
const wsWindow = (shH) => {
  const src = `(w) => {
  const width = Number(w.width) || 0;
  const height = Number(w.height) || 0;
  const shutterWidth = width === 0 ? 0 : width - 60;
  const shutterHeight = height === 0 ? 0 : height - ${shH};
  const framWidth = width === 0 ? 0 : height - 90;
  const sashWidth = shutterWidth === 0 ? 0 : shutterHeight - 125;
  return { shutterWidth, shutterHeight, framWidth, sashWidth, glassWidth: 0, glassHeight: 0, glassNos: 0, sqft: 0 };
}`;
  return (0, eval)(src);
};
const wsTotals = (results) => {
  const ceil1 = (x) => (x === 0 ? 0 : Math.ceil(x * 10) / 10);
  const q = (r) => Number(r.qty) || 1;
  const S = (f) => results.reduce((a, r) => a + (f(r) || 0) * q(r), 0);
  const sB = S((r) => Number(r.width) || 0), sC = S((r) => Number(r.height) || 0);
  const sD = S((r) => r.shutterWidth), sE = S((r) => r.shutterHeight);
  const sK = S((r) => r.framWidth), sL = S((r) => r.sashWidth);
  const windowCount = results.reduce((a, r) => a + q(r), 0);
  const opFramBars = ceil1(((sB + sC) * 2) / 5850);
  const opSashBars = ceil1(((sD * 2) + (sE * 2)) / 5850);
  const opBeadBars = opSashBars;
  const framSteel = ceil1((sK * 2 + 500) / 2438);
  const sashSteel = ceil1((sL * 2) / 2438);
  return { windowCount, opFramBars, opSashBars, opBeadBars, framSteel, sashSteel };
};
const wsRules = (shH) => [
  { key: "shutterWidth", name: "shutterWidth", formula: "IF(Width==0,0,Width-60)" },
  { key: "shutterHeight", name: "shutterHeight", formula: `IF(Height==0,0,Height-${shH})` },
  { key: "framWidth", name: "framWidth", formula: "IF(Width==0,0,Height-90)" },
  { key: "sashWidth", name: "sashWidth", formula: "IF(shutterWidth==0,0,shutterHeight-125)" },
  { key: "opFramBars", name: "opFramBars", formula: "CEILING(((SUM(Width)+SUM(Height))*2/5850),0.1)" },
  { key: "opSashBars", name: "opSashBars", formula: "CEILING((SUM(shutterWidth)*2+SUM(shutterHeight)*2)/5850,0.1)" },
  { key: "opBeadBars", name: "opBeadBars", formula: "opSashBars (= H8 mirrors H7)" },
  { key: "framSteel", name: "framSteel", formula: "CEILING((SUM(framWidth)*2+500)/2438,0.1)" },
  { key: "sashSteel", name: "sashSteel", formula: "CEILING(SUM(sashWidth)*2/2438,0.1)" },
];
const wsLinks = {
  "60 Casement Fram": "opFramBars",
  "60 Outward Sash": "opSashBars",
  "60 Single Galzing Bead": "opBeadBars",
  "Fram (Steel)": "framSteel",
  "OP Sash (Steel)": "sashSteel",
};
const wsGeneral = [
  { label: "shutterWidth", key: "shutterWidth" }, { label: "shutterHeight", key: "shutterHeight" },
  { label: "framWidth", key: "framWidth" }, { label: "sashWidth", key: "sashWidth" },
];
const wsTotalRows = [
  { label: "opFramBars", key: "opFramBars" }, { label: "opSashBars", key: "opSashBars" },
  { label: "opBeadBars", key: "opBeadBars" }, { label: "framSteel", key: "framSteel" },
  { label: "sashSteel", key: "sashSteel" },
];
const wsOracle = (wb) => ({
  workbook: `${DOOR}/Window Sash/${wb}`, sheet: "Single Open", firstRow: 6,
  sampleWindows: [{ width: 900, height: 1200, qty: 1 }],
  winCells: { shutterWidth: "D", shutterHeight: "E", framWidth: "K", sashWidth: "L" },
  totalCells: { opFramBars: "H6", opSashBars: "H7", opBeadBars: "H8", framSteel: "H10", sashSteel: "H11" },
});
const wsCfg = (code, file, comp, title, shH, wb) => ({
  code, fileName: file, compName: comp, title,
  computeWindow: wsWindow(shH), computeTotals: wsTotals,
  rules: wsRules(shH), materialLinks: wsLinks, generalRows: wsGeneral, totalRows: wsTotalRows,
  oracle: wsOracle(wb),
});

export const CONFIGS = [
  doorCfg("EXCEL-586331", "SingleOpenDoorWOB.jsx", "SingleOpenDoorWOB",
    "BREEZE-(S.Open Door Without Bottom, Rib Cut)", 60, 20, DOOR,
    "Single Open Door Without Bottom BREEZE Production.xlsx"),
  doorCfg("EXCEL-586254", "SingleOpenDoorBBeadWOB.jsx", "SingleOpenDoorBBeadWOB",
    "BREEZE - (S.O Main Door W.O Btm, B.B)", 60, 40, DOOR,
    "Single Open Door B.Bead Without Bottom BREEZE Production.xlsx"),
  doorCfg("EXCEL-586295", "SingleOpenDoorWithBtm.jsx", "SingleOpenDoorWithBtm",
    "BREEZE - (Single Open Door With Bottom)", 60, 60, DOOR,
    "Single Open Door With Bottom BREEZE Production.xlsx"),
  doorCfg("EXCEL-587540", "SingleOpenDoorWithBtmAran.jsx", "SingleOpenDoorWithBtmAran",
    "ARAN-(Single Open Door With Bottom)", 66, 66, ARAN,
    "Single Open Door With Bottom ARAN Production.xlsx"),
  wsCfg("EXCEL-586373", "SODoorWindowSashWithBtm.jsx", "SODoorWindowSashWithBtm",
    "BREEZE-(S.Open Door, Window Sash With Btm)", 60,
    "Single Open Door Window Sash With Btm Breeze Production.xlsx"),
  wsCfg("EXCEL-586396", "SODoorWindowSashWOB.jsx", "SODoorWindowSashWOB",
    "BREEZE-(S.Op Door, Window Sash W.out Btm)", 40,
    "S.Op Door Window Sash W.out Btm Breeze Production.xlsx"),
];
