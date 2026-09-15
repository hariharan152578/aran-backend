import mongoose from 'mongoose';
import ProductionCard from '../src/modules/production/models/ProductionCard.js';
import DispatchOrder from '../src/modules/dispatch/models/DispatchOrder.js';
import Order from '../src/modules/sales/models/Order.js';

const syncCompletedProductionCards = async () => {
  try {
    await DispatchOrder.deleteMany({ customerName: 'Customer Ref' });

    const completedCards = await ProductionCard.find({ status: 'Completed' });
    console.log("Found", completedCards.length, "completed cards");
    for (const card of completedCards) {
      let orderId = 'custom';
      if (card.orderId) {
        if (typeof card.orderId === 'object') {
          orderId = String(card.orderId._id || card.orderId.id || '');
        } else {
          orderId = String(card.orderId);
        }
      }
      if (!orderId || orderId.trim() === '' || orderId === 'undefined' || orderId === 'null' || orderId === '[object Object]') {
        orderId = 'custom';
      }

      let customerName = card.customerName;
      let deliveryAddress = card.projectName;

      if (card.orderId && mongoose.Types.ObjectId.isValid(card.orderId)) {
        try {
          const orderDoc = await Order.findById(card.orderId);
          if (orderDoc) {
            customerName = customerName || orderDoc.customerName;
            deliveryAddress = deliveryAddress || orderDoc.projectName;
          }
        } catch (e) {}
      }

      customerName = customerName || 'Customer Ref';
      deliveryAddress = deliveryAddress || 'Factory Site Staging Area';

      const findQuery = { batchId: card._id };
      
      const existing = await DispatchOrder.findOne(findQuery);
      if (!existing) {
        const count = await DispatchOrder.countDocuments();
        const dispatchNumber = `DISP-2026-${String(count + 1).padStart(3, '0')}`;
        
        console.log("Creating DispatchOrder for card", card._id, "with dispatchNumber", dispatchNumber);
        const newDispatch = new DispatchOrder({
          dispatchNumber,
          orderId,
          customerName,
          deliveryAddress,
          status: 'Not Reached',
          batchId: card._id,
          batchNumber: `BATCH-${String(card._id).slice(-6).toUpperCase()}`,
          templateName: card.templateName || card.templateId?.name || 'Standard Template',
          qty: card.qty || 1
        });
        await newDispatch.save();
      } else {
        console.log("DispatchOrder already exists for card", card._id);
      }
    }
  } catch (err) {
    console.error('Failed to sync completed production cards to dispatch:', err);
  }
};

async function run() {
  await mongoose.connect('mongodb://localhost:27017/aran_erp');
  await syncCompletedProductionCards();
  await mongoose.disconnect();
}
run();
