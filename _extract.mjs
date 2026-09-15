import xlsx from 'xlsx';
const wb = xlsx.readFile(process.argv[2], { cellFormula: true, cellNF: true });
for (const sheetName of wb.SheetNames) {
  const ws = wb.Sheets[sheetName];
  console.log(`\n==== SHEET: ${sheetName}  ref=${ws['!ref']} ====`);
  for (const addr of Object.keys(ws)) {
    if (addr[0] === '!') continue;
    const c = ws[addr];
    if (c.f) console.log(`${addr}  =${c.f}   [v=${c.v}]`);
    else if (c.v !== undefined && c.v !== '') console.log(`${addr}  ${JSON.stringify(c.v)}`);
  }
}
