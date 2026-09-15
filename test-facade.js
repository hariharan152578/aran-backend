import connectDB from './src/config/db.js';
import { processExcelToTemplate } from './src/modules/configuration/services/EnterpriseExtractionFacade.js';
import fs from 'fs';

async function run() {
  await connectDB();
  const res = await processExcelToTemplate('temp_uploads\\1780422523009-OP-OP V.Cutting Breeze Production.xlsx', 'temp_uploads\\1780422523009-OP-OP V.Cutting Breeze Production.xlsx');
  fs.writeFileSync('debug.json', JSON.stringify(res, null, 2));
  process.exit(0);
}
run();
