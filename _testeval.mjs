import { loadSheet } from './_xleval.mjs';
// Test 1: Fixed sample data — already has B6=929,C6=259, expect H6=0.5, D6=427.5
{
  const { sheet } = loadSheet("E:/work files/Hari anna/test/test/Production/Breeze/Fixed Breeze Production [Sample data].xlsx", 'FIX');
  console.log('Fixed sample: D6=', sheet.eval('D6'), '(exp 427.5)  H6=', sheet.eval('H6'), '(exp 0.5)  H7=', sheet.eval('H7'), '(exp 0.5)');
}
// Test 2: Fixed INTACT 609x2126 -> H6=1
{
  const { sheet } = loadSheet("E:/work files/Hari anna/test/test/Production/INTACT/Fixed - Louver/Fixed INTACT Production.xlsx", 'FIX');
  console.log('Fixed INTACT: H6=', sheet.eval('H6'), '(exp 1)  D6=', sheet.eval('D6'), '(exp 267.5)');
}
// Test 3: inject into empty Top Hung sheet, 929x259, compare to known: shutterFramWidth 869, sashWidth 74, glass 744x74, totalSqft 1.25
{
  const { sheet, ws } = loadSheet("E:/work files/Hari anna/test/test/Production/Breeze/Open/40mm Shutter/End Mullion Clamp/Top Hung Breeze Production.xlsx");
  console.log('TopHung sheet name check, A3=', ws['A3'] && ws['A3'].v);
}
