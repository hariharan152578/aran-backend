import { loadSheet } from './_xleval.mjs';
const { sheet } = loadSheet("E:/work files/Hari anna/test/test/Production/Breeze/Open/40mm Shutter/End Mullion Clamp/Top Hung Breeze Production.xlsx", 'Single Open');
// inject sample row, clear cache, recompute independently
sheet.set('A6', 1); sheet.set('B6', 929); sheet.set('C6', 259);
sheet.reset(); sheet.set('A6', 1); sheet.set('B6', 929); sheet.set('C6', 259);
const got = {
  D6_shutterFramWidth: sheet.eval('D6'), L6_sashWidth: sheet.eval('L6'),
  O6_glassW: sheet.eval('O6'), P6_glassH: sheet.eval('P6'),
  H10_framSteel: sheet.eval('H10'), T17_totalSqft: sheet.eval('T17'),
};
console.log(JSON.stringify(got, null, 0));
console.log('Expected: shutterFramWidth 869, sashWidth 74, glass 744x74, framSteel 0.4, totalSqft 1.25');
