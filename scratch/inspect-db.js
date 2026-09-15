import mongoose from 'mongoose';
import ProductionCard from '../src/modules/production/models/ProductionCard.js';
import DispatchOrder from '../src/modules/dispatch/models/DispatchOrder.js';

async function run() {
  await mongoose.connect('mongodb://localhost:27017/aran_erp');
  
  const totalCards = await ProductionCard.countDocuments();
  console.log('Total ProductionCards:', totalCards);
  
  const cardsGrouped = await ProductionCard.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 } } }
  ]);
  console.log('ProductionCards by status:', cardsGrouped);
  
  const completedCards = await ProductionCard.find({ status: 'Completed' });
  console.log('Completed ProductionCards details:');
  for (const card of completedCards) {
    console.log(`- ID: ${card._id}, OrderId: ${card.orderId}, customerName: ${card.customerName}, templateName: ${card.templateName || card.templateId?.name}, qty: ${card.qty}`);
  }
  
  const totalDispatches = await DispatchOrder.countDocuments();
  console.log('Total DispatchOrders:', totalDispatches);
  
  const dispatchesGrouped = await DispatchOrder.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 } } }
  ]);
  console.log('DispatchOrders by status:', dispatchesGrouped);
  
  const dispatches = await DispatchOrder.find().sort({ createdAt: -1 });
  console.log('All DispatchOrders:');
  for (const d of dispatches) {
    console.log(`- ${d.dispatchNumber}: Status: ${d.status}, BatchId: ${d.batchId}, BatchNumber: ${d.batchNumber}, Customer: ${d.customerName}, Destination: ${d.deliveryAddress}`);
  }

  await mongoose.disconnect();
}
run();
