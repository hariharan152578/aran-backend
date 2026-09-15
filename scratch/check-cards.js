import mongoose from 'mongoose';
import ProductionCard from '../src/modules/production/models/ProductionCard.js';

async function test() {
  try {
    await mongoose.connect('mongodb://localhost:27017/aran_erp');
    const cards = await ProductionCard.find({ status: 'Completed' });
    console.log("Completed cards in DB:", cards.map(c => ({
      _id: c._id,
      batchNumber: `BATCH-${String(c._id).slice(-6).toUpperCase()}`,
      status: c.status
    })));
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}
test();
