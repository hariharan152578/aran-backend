import mongoose from 'mongoose';
import fs from 'fs';
await mongoose.connect('mongodb://127.0.0.1:27017/aran_erp');
const db = mongoose.connection;
const t = await db.collection('templates').findOne({ code: process.argv[2] });
fs.writeFileSync(process.argv[3], t.reactCode || '', 'utf8');
console.log('dumped', process.argv[2], (t.reactCode||'').length, 'chars ->', process.argv[3]);
await mongoose.disconnect();
