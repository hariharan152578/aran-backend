import express from 'express';
import mongoose from 'mongoose';
import Vehicle from './models/Vehicle.js';
import Courier from './models/Courier.js';
import DispatchOrder from './models/DispatchOrder.js';
import Order from '../sales/models/Order.js';
import WarrantyCard from '../service/models/WarrantyCard.js';
import InstallationOrder from '../installation/models/InstallationOrder.js';
import ProductionCard from '../production/models/ProductionCard.js';

const router = express.Router();



// Sync completed production cards into dispatch orders
const syncCompletedProductionCards = async () => {
  try {
    // Clean up temporary placeholder entries so they can rebuild with correct names
    await DispatchOrder.deleteMany({ customerName: 'Customer Ref' });

    const completedCards = await ProductionCard.find({ status: 'Completed' });
    for (const card of completedCards) {
      // Clean orderId
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

      // Resolve customerName and deliveryAddress robustly
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

      const findQuery = { batchId: { $in: [card._id, String(card._id)] } };
      
      const existing = await DispatchOrder.findOne(findQuery);
      if (!existing) {
        const lastDispatch = await DispatchOrder.findOne().sort({ createdAt: -1 });
        let nextNum = 1;
        if (lastDispatch && lastDispatch.dispatchNumber) {
          const match = lastDispatch.dispatchNumber.match(/-(\d+)$/);
          if (match) {
            nextNum = parseInt(match[1]) + 1;
          }
        }
        
        let dispatchNumber = '';
        let num = nextNum;
        let isUnique = false;
        while (!isUnique) {
          dispatchNumber = `DISP-2026-${String(num).padStart(3, '0')}`;
          const dup = await DispatchOrder.findOne({ dispatchNumber });
          if (!dup) {
            isUnique = true;
          } else {
            num++;
          }
        }
        
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
      }
    }
  } catch (err) {
    console.error('Failed to sync completed production cards to dispatch:', err);
  }
};

// Custom populate helper for DispatchOrder to cleanly handle hybrid orderId schemas
const populateDispatch = async (dispatch) => {
  if (!dispatch) return null;
  const dispatchObj = dispatch.toObject();

  // Populate orderId
  if (dispatch.orderId) {
    if (mongoose.Types.ObjectId.isValid(dispatch.orderId)) {
      try {
        const orderDoc = await Order.findById(dispatch.orderId);
        if (orderDoc) {
          dispatchObj.orderId = orderDoc;
        } else {
          dispatchObj.orderId = {
            _id: String(dispatch.orderId),
            customerName: dispatch.customerName || 'Customer Ref',
            projectName: dispatch.deliveryAddress || 'Factory Site Staging Area'
          };
        }
      } catch (err) {
        dispatchObj.orderId = {
          _id: String(dispatch.orderId),
          customerName: dispatch.customerName || 'Customer Ref',
          projectName: dispatch.deliveryAddress || 'Factory Site Staging Area'
        };
      }
    } else {
      dispatchObj.orderId = {
        _id: String(dispatch.orderId),
        customerName: dispatch.customerName || 'Customer Ref',
        projectName: dispatch.deliveryAddress || 'Factory Site Staging Area'
      };
    }
  }

  // Populate vehicleId
  if (dispatch.vehicleId) {
    if (mongoose.Types.ObjectId.isValid(dispatch.vehicleId)) {
      try {
        const vehicleDoc = await Vehicle.findById(dispatch.vehicleId);
        if (vehicleDoc) {
          dispatchObj.vehicleId = vehicleDoc;
        }
      } catch (err) {}
    }
  }

  // Populate courierId
  if (dispatch.courierId) {
    if (mongoose.Types.ObjectId.isValid(dispatch.courierId)) {
      try {
        const courierDoc = await Courier.findById(dispatch.courierId);
        if (courierDoc) {
          dispatchObj.courierId = courierDoc;
        }
      } catch (err) {}
    }
  }

  return dispatchObj;
};

// VEHICLES
router.get('/vehicles', async (req, res) => {
  try {
    const data = await Vehicle.find().sort({ vehicleNumber: 1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/vehicles', async (req, res) => {
  try {
    const data = new Vehicle(req.body);
    await data.save();
    res.status(201).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/vehicles/:id', async (req, res) => {
  try {
    const vehicle = await Vehicle.findByIdAndDelete(req.params.id);
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// COURIERS
router.get('/couriers', async (req, res) => {
  try {
    const data = await Courier.find().sort({ courierName: 1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/couriers', async (req, res) => {
  try {
    const data = new Courier(req.body);
    await data.save();
    res.status(201).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/couriers/:id', async (req, res) => {
  try {
    const courier = await Courier.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!courier) return res.status(404).json({ error: 'Courier not found' });
    res.json(courier);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/couriers/:id', async (req, res) => {
  try {
    const courier = await Courier.findByIdAndDelete(req.params.id);
    if (!courier) return res.status(404).json({ error: 'Courier not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DISPATCH ORDERS
router.get('/orders', async (req, res) => {
  try {
    await syncCompletedProductionCards();
    const orders = await DispatchOrder.find().sort({ createdAt: -1 });
    const populated = await Promise.all(orders.map(async (dispatch) => {
      return await populateDispatch(dispatch);
    }));
    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/orders', async (req, res) => {
  try {
    const lastDispatch = await DispatchOrder.findOne().sort({ createdAt: -1 });
    let nextNum = 1;
    if (lastDispatch && lastDispatch.dispatchNumber) {
      const match = lastDispatch.dispatchNumber.match(/-(\d+)$/);
      if (match) {
        nextNum = parseInt(match[1]) + 1;
      }
    }
    
    let dispatchNumber = '';
    let num = nextNum;
    let isUnique = false;
    while (!isUnique) {
      dispatchNumber = `DISP-2026-${String(num).padStart(3, '0')}`;
      const dup = await DispatchOrder.findOne({ dispatchNumber });
      if (!dup) {
        isUnique = true;
      } else {
        num++;
      }
    }

    const data = new DispatchOrder({ ...req.body, dispatchNumber });
    await data.save();
    
    const populated = await populateDispatch(data);
    res.status(201).json(populated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/orders/:id', async (req, res) => {
  try {
    const { status, vehicleId, dispatchMode, courierId, courierName, trackingNo } = req.body;
    const dispatch = await DispatchOrder.findById(req.params.id);
    if (!dispatch) return res.status(404).json({ error: 'Dispatch order not found' });

    dispatch.status = status || dispatch.status;
    if (dispatchMode !== undefined) dispatch.dispatchMode = dispatchMode;
    if (vehicleId !== undefined) dispatch.vehicleId = vehicleId || null;
    if (courierId !== undefined) dispatch.courierId = courierId || null;
    if (courierName !== undefined) dispatch.courierName = courierName;
    if (trackingNo !== undefined) dispatch.trackingNo = trackingNo;
    await dispatch.save();

    // Side effects on status = 'Delivered'
    if (dispatch.status === 'Delivered') {
      // 1. Update main order status if orderId is a valid ObjectId
      if (dispatch.orderId && mongoose.Types.ObjectId.isValid(dispatch.orderId)) {
        await Order.findByIdAndUpdate(dispatch.orderId, { status: 'Dispatched' });
      }

      // 2. Auto-generate Installation Order
      const installCount = await InstallationOrder.countDocuments();
      const installationNumber = `INST-2026-${String(installCount + 1).padStart(3, '0')}`;
      const installOrder = new InstallationOrder({
        installationNumber,
        orderId: dispatch.orderId,
        customerName: dispatch.customerName,
        address: dispatch.deliveryAddress,
        status: 'Scheduled',
        scheduledDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) // 2 days later
      });
      await installOrder.save();

      // 3. Auto-generate Warranty Card
      const warrantyCount = await WarrantyCard.countDocuments();
      const warrantyNumber = `WARN-2026-${String(warrantyCount + 1).padStart(3, '0')}`;
      const warranty = new WarrantyCard({
        warrantyNumber,
        orderId: dispatch.orderId,
        customerName: dispatch.customerName,
        productDetails: `Aran Twin System Order ${dispatch.orderId}`,
        startDate: new Date(),
        durationYears: 5,
        status: 'Active'
      });
      await warranty.save();
    }

    const populated = await populateDispatch(dispatch);
    res.json(populated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete Dispatch Order
router.delete('/orders/:id', async (req, res) => {
  try {
    const dispatch = await DispatchOrder.findByIdAndDelete(req.params.id);
    if (!dispatch) return res.status(404).json({ error: 'Dispatch order not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
