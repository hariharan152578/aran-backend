import express from 'express';
import mongoose from 'mongoose';
import Order from '../sales/models/Order.js';
import Quotation from '../sales/models/Quotation.js';
import ProductionCard from './models/ProductionCard.js';
import Template from '../configuration/models/Template.js';
import { runEngine } from '../calculation-engine/engineDispatcher.js';

const router = express.Router();

// Helper to recursively extract a clean string ID from any potential nested object structure
const extractIdString = (id) => {
  if (!id) return '';
  if (typeof id === 'string') return id;
  if (typeof id === 'object') {
    if (mongoose.Types.ObjectId.isValid(id) || id.constructor?.name === 'ObjectId') {
      return id.toString();
    }
    if (id._id) return extractIdString(id._id);
    if (id.id && typeof id.id === 'string') return id.id;
    return id.toString();
  }
  const str = String(id);
  return str === '[object Object]' ? '' : str;
};

// Custom population helper to avoid Mongoose CastErrors when IDs are strings
const populateCard = async (card) => {
  const cardObj = card.toObject();
  
  // Populate orderId
  if (card.orderId) {
    const rawOrderId = card.orderId;
    const idKey = typeof rawOrderId === 'object' && rawOrderId !== null
      ? (rawOrderId.id || rawOrderId._id || rawOrderId.orderNumber || '')
      : String(rawOrderId || '');

    let orderDoc = null;
    if (idKey) {
      try {
        const queryOr = [{ id: idKey }, { orderNumber: idKey }];
        if (mongoose.Types.ObjectId.isValid(idKey)) {
          queryOr.push({ _id: idKey });
        }
        orderDoc = await Order.findOne({ $or: queryOr });
      } catch (e) {
        console.warn('Failed to lookup order by idKey:', idKey, e.message);
      }
    }

    if (orderDoc) {
      const orderObj = orderDoc.toObject ? orderDoc.toObject() : orderDoc;

      // Populate quotation details & extraCharges if available
      try {
        const quotQuery = [];
        if (orderObj.quotationRef) {
          quotQuery.push({ quotationNumber: orderObj.quotationRef });
          if (mongoose.Types.ObjectId.isValid(orderObj.quotationRef)) {
            quotQuery.push({ _id: orderObj.quotationRef });
          }
        }
        if (orderObj.id) quotQuery.push({ orderRef: orderObj.id });
        if (orderObj.orderNumber) quotQuery.push({ orderRef: orderObj.orderNumber });

        if (quotQuery.length > 0) {
          const quotDoc = await Quotation.findOne({ $or: quotQuery }).lean();
          if (quotDoc) {
            orderObj.quotation = quotDoc;
            if (!orderObj.extraCharges && quotDoc.extraCharges) {
              orderObj.extraCharges = quotDoc.extraCharges;
            }
            if ((!orderObj.additionalCharges || orderObj.additionalCharges.length === 0) && quotDoc.additionalCharges) {
              orderObj.additionalCharges = quotDoc.additionalCharges;
            }
          }
        }
      } catch (err) {
        console.warn('Failed to link quotation to order in card population:', err.message);
      }

      const party = orderObj.party;
      const partyName = typeof party === 'object' && party !== null
        ? (party.customerName || party.name || party.company || '')
        : (typeof party === 'string' ? party : '');

      const resolvedAmt = orderObj.amount || orderObj.totalAmount || 0;

      cardObj.orderId = {
        ...orderObj,
        _id: extractIdString(orderDoc._id),
        id: orderObj.id || extractIdString(orderDoc._id),
        customerName: orderObj.customerName || partyName || card.customerName || 'Local/Custom Customer',
        projectName: orderObj.projectName || card.projectName || 'Custom Project',
        status: orderObj.status || 'Active',
        totalAmount: resolvedAmt,
        amount: resolvedAmt,
        createdAt: orderObj.createdAt || card.createdAt
      };
    } else if (typeof rawOrderId === 'object' && rawOrderId !== null) {
      const party = rawOrderId.party;
      const partyName = typeof party === 'object' && party !== null
        ? (party.customerName || party.name || party.company || '')
        : (typeof party === 'string' ? party : '');

      const resolvedAmt = rawOrderId.amount || rawOrderId.totalAmount || 0;

      cardObj.orderId = {
        _id: extractIdString(rawOrderId),
        id: rawOrderId.id || extractIdString(rawOrderId),
        customerName: rawOrderId.customerName || partyName || card.customerName || 'Local/Custom Customer',
        projectName: rawOrderId.projectName || card.projectName || 'Custom Project',
        status: rawOrderId.status || 'Active',
        totalAmount: resolvedAmt,
        amount: resolvedAmt,
        createdAt: rawOrderId.createdAt || card.createdAt
      };
    } else {
      cardObj.orderId = {
        _id: String(rawOrderId),
        id: String(rawOrderId),
        customerName: card.customerName || 'Local/Custom Customer',
        projectName: card.projectName || 'Custom Project',
        status: 'Active',
        totalAmount: 0,
        amount: 0
      };
    }
  }

  // Populate templateId
  if (card.templateId) {
    const rawTemplateId = (typeof card.templateId === 'object' && card.templateId !== null)
      ? (card.templateId._id || card.templateId.id)
      : card.templateId;

    let templateDoc = null;
    if (rawTemplateId && mongoose.Types.ObjectId.isValid(rawTemplateId)) {
      try {
        templateDoc = await Template.findById(rawTemplateId).lean();
      } catch (err) {}
    } else if (typeof rawTemplateId === 'string' && rawTemplateId.length > 0) {
      try {
        templateDoc = await Template.findOne({ $or: [{ code: rawTemplateId }, { name: rawTemplateId }] }).lean();
      } catch (err) {}
    }

    if (templateDoc) {
      cardObj.templateId = {
        ...templateDoc,
        _id: extractIdString(templateDoc._id),
        name: templateDoc.name,
        code: templateDoc.code,
        googleSheet: templateDoc.googleSheet || null
      };
      if (templateDoc.googleSheet?.defaultPrintPages && templateDoc.googleSheet.defaultPrintPages.length > 0) {
        cardObj.defaultPrintPages = templateDoc.googleSheet.defaultPrintPages;
      }
      if (templateDoc.googleSheet?.customCellStyles) {
        cardObj.customCellStyles = templateDoc.googleSheet.customCellStyles;
      }
    } else if (typeof card.templateId === 'object' && card.templateId !== null) {
      cardObj.templateId = {
        ...card.templateId,
        _id: extractIdString(card.templateId),
        name: card.templateId.name || card.templateName || 'Local Template',
        code: String(card.templateId.code || card.templateId.name || extractIdString(card.templateId) || 'STD-TWIN'),
        googleSheet: card.templateId.googleSheet || null
      };
      if (card.templateId.googleSheet?.defaultPrintPages && card.templateId.googleSheet.defaultPrintPages.length > 0) {
        cardObj.defaultPrintPages = card.templateId.googleSheet.defaultPrintPages;
      }
      if (card.templateId.googleSheet?.customCellStyles) {
        cardObj.customCellStyles = card.templateId.googleSheet.customCellStyles;
      }
    } else {
      cardObj.templateId = {
        _id: extractIdString(card.templateId),
        name: card.templateName || 'Local Template',
        code: String(card.templateId)
      };
    }
  }

  // Fallback if defaultPrintPages is still not set on cardObj
  if (!cardObj.defaultPrintPages || cardObj.defaultPrintPages.length === 0) {
    const fallbackTemplateRef = card.templateCode || card.templateName || card.measurements?.groups?.[0]?.templateCode || card.measurements?.groups?.[0]?.templateName;
    if (fallbackTemplateRef) {
      try {
        const tDoc = await Template.findOne({ $or: [{ code: fallbackTemplateRef }, { name: fallbackTemplateRef }] }).lean();
        if (tDoc?.googleSheet?.defaultPrintPages && tDoc.googleSheet.defaultPrintPages.length > 0) {
          cardObj.defaultPrintPages = tDoc.googleSheet.defaultPrintPages;
          if (tDoc.googleSheet?.customCellStyles) {
            cardObj.customCellStyles = tDoc.googleSheet.customCellStyles;
          }
        }
      } catch (err) {}
    }
  }

  return cardObj;
};

router.get('/', (req, res) => {
  res.json({ message: 'Aran ERP: PRODUCTION module is active' });
});

// Endpoint to execute the Calculation Engine and generate a Production Card from an Order
router.post('/cards/generate', async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ error: 'orderId is required' });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!order.templateId) {
      return res.status(400).json({ error: 'Order has no template assigned' });
    }

    // Run the Core Engineering Math Evaluator
    const orderNo = order.orderNumber || order.id || order._id?.toString() || '';
    const engineOutput = await runEngine(order.templateId, order.lineItems, { orderNo });

    let templateDoc = null;
    try {
      templateDoc = await Template.findById(order.templateId);
    } catch {}

    const measurementsData = {
      groups: [{
        templateId: order.templateId,
        templateName: templateDoc ? templateDoc.name : '',
        templateCode: templateDoc ? templateDoc.code : '',
        orderNo,
        windows: order.lineItems?.map((item, idx) => ({
          wNo: item.windowNo || `W${idx + 1}`,
          width: Number(item.measurements?.width || item.measurements?.widthMM || 0),
          height: Number(item.measurements?.height || item.measurements?.heightMM || 0),
          qty: Number(item.qty) || 1
        })) || [],
        cuttingList: engineOutput.cuttingList || [],
        glassList: engineOutput.glassList || [],
        hardwareList: engineOutput.hardwareList || [],
        totalBomConsumption: engineOutput.totalBomConsumption || [],
        sheetResult: engineOutput.sheetResult || null
      }],
      sheetResult: engineOutput.sheetResult || null
    };

    // Generate Production Card
    const card = new ProductionCard({
      orderId: order._id,
      templateId: order.templateId,
      customerName: order.customerName,
      projectName: order.projectName,
      templateName: templateDoc ? templateDoc.name : '',
      productionDate: new Date(),
      status: 'Created',
      qty: order.lineItems?.reduce((acc, item) => acc + (item.qty || 1), 0) || 1,
      cuttingList: engineOutput.cuttingList,
      glassList: engineOutput.glassList,
      hardwareList: engineOutput.hardwareList,
      totalBomConsumption: engineOutput.totalBomConsumption,
      measurements: measurementsData
    });

    await card.save();
    
    // Also update order status
    order.status = 'In Production';
    await order.save();

    const populatedCard = await populateCard(card);
    res.status(201).json({ message: 'Production Card Generated', card: populatedCard });
  } catch (error) {
    console.error('Error generating production card:', error);
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
});

// Endpoint to simulate Production Card calculations (returns lists without saving to DB)
router.post('/cards/simulate', async (req, res) => {
  try {
    const { templateId, measurements, qty, lineItems, orderNo } = req.body;
    if (!templateId) {
      return res.status(400).json({ error: 'templateId is required' });
    }

    // Resolve Template by checking if it exists in the database
    let template = null;
    if (mongoose.Types.ObjectId.isValid(templateId)) {
      template = await Template.findById(templateId);
    }
    if (!template) {
      template = await Template.findOne({ code: templateId });
    }
    if (!template) {
      template = await Template.findOne({ name: templateId });
    }

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const itemsToRun = Array.isArray(lineItems) && lineItems.length > 0
      ? lineItems
      : [
          {
            qty: Number(qty) || 1,
            measurements: measurements || {}
          }
        ];

    const engineOutput = await runEngine(template, itemsToRun, { orderNo });

    res.json(engineOutput);
  } catch (error) {
    console.error('Error simulating production card:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to manually create a Production Card (called from Orders page)
router.post('/cards', async (req, res) => {
  try {
    const { 
      orderId, 
      templateId, 
      qty, 
      priority, 
      notes, 
      status,
      customerName,
      projectName,
      templateName,
      cuttingList,
      glassList,
      hardwareList,
      totalBomConsumption,
      measurements
    } = req.body;

    // Resolve Template by checking if it exists in the database
    let template = null;
    if (templateId) {
      if (mongoose.Types.ObjectId.isValid(templateId)) {
        template = await Template.findById(templateId);
      }
      if (!template) {
        template = await Template.findOne({ code: templateId });
      }
      if (!template) {
        template = await Template.findOne({ name: templateId });
      }
    }

    const cardTemplateId = template ? template._id : templateId;

    let cuttingListRes = Array.isArray(cuttingList) ? [...cuttingList] : [];
    let glassListRes = Array.isArray(glassList) ? [...glassList] : [];
    let hardwareListRes = Array.isArray(hardwareList) ? [...hardwareList] : [];
    let totalBomRes = Array.isArray(totalBomConsumption) ? [...totalBomConsumption] : [];

    const processedMeasurements = measurements ? JSON.parse(JSON.stringify(measurements)) : {};

    // ── Evaluate engine calculations for all groups/templates and store in DB ──
    if (processedMeasurements.groups && Array.isArray(processedMeasurements.groups) && processedMeasurements.groups.length > 0) {
      for (const grp of processedMeasurements.groups) {
        let grpTemplate = null;
        const gTId = grp.templateId || grp.templateCode || grp.templateName;
        if (gTId) {
          if (mongoose.Types.ObjectId.isValid(gTId)) {
            grpTemplate = await Template.findById(gTId);
          }
          if (!grpTemplate) {
            grpTemplate = await Template.findOne({ code: gTId }) || await Template.findOne({ name: gTId });
          }
        }
        if (!grpTemplate && template) grpTemplate = template;

        const grpWindows = Array.isArray(grp.windows) && grp.windows.length > 0 ? grp.windows : [{
          wNo: 'W1',
          width: 0,
          height: 0,
          qty: 1
        }];

        const lineItems = grpWindows.map((w, idx) => ({
          windowNo: w.wNo || w.wno || `W${idx + 1}`,
          qty: Number(w.qty) || 1,
          measurements: {
            width: Number(w.width || w.widthMM || 0),
            height: Number(w.height || w.heightMM || 0),
            widthMM: Number(w.width || w.widthMM || 0),
            heightMM: Number(w.height || w.heightMM || 0),
            'Width (mm)': Number(w.width || w.widthMM || 0),
            'Height (mm)': Number(w.height || w.heightMM || 0),
            qty: Number(w.qty) || 1,
            ...(grp.inputs || {})
          }
        }));

        if (grpTemplate) {
          try {
            const cardOrderNo = typeof orderId === 'object' ? (orderId?._id || orderId?.id || '') : (orderId || '');
            const out = await runEngine(grpTemplate, lineItems, { orderNo: cardOrderNo });
            if (out) {
              grp.cuttingList = out.cuttingList || [];
              grp.glassList = out.glassList || [];
              grp.hardwareList = out.hardwareList || [];
              grp.totalBomConsumption = out.totalBomConsumption || [];
              grp.sheetResult = out.sheetResult || null;
              grp.orderNo = cardOrderNo;
              grp.results = grpWindows.map((w, i) => {
                const fixFramItem = (out.cuttingList || []).find(c => (c.materialName || '').toLowerCase().includes('fram') || (c.materialName || '').toLowerCase().includes('casment'))
                  || (out.totalBomConsumption || []).find(b => (b.materialName || '').toLowerCase().includes('fram') || (b.materialName || '').toLowerCase().includes('casment'));
                const opBeadItem = (out.cuttingList || []).find(c => (c.materialName || '').toLowerCase().includes('bead') || (c.materialName || '').toLowerCase().includes('galzing'))
                  || (out.totalBomConsumption || []).find(b => (b.materialName || '').toLowerCase().includes('bead') || (b.materialName || '').toLowerCase().includes('galzing'));

                return {
                  wno: w.wNo || w.wno || `W${i + 1}`,
                  width: Number(w.width || w.widthMM || 0),
                  height: Number(w.height || w.heightMM || 0),
                  qty: Number(w.qty) || 1,
                  fixFrameBars: fixFramItem ? Number(fixFramItem.qty) : undefined,
                  opBeadBars: opBeadItem ? Number(opBeadItem.qty) : undefined,
                };
              });

              if (out.cuttingList) cuttingListRes.push(...out.cuttingList);
              if (out.glassList) glassListRes.push(...out.glassList);
              if (out.hardwareList) hardwareListRes.push(...out.hardwareList);
              if (out.totalBomConsumption) totalBomRes.push(...out.totalBomConsumption);
            }
          } catch (e) {
            console.warn('Failed to calculate group engine output for card save:', e.message);
          }
        }
      }
    } else if (template) {
      try {
        const cardOrderNo = typeof orderId === 'object' ? (orderId?._id || orderId?.id || '') : (orderId || '');
        const out = await runEngine(template, [
          {
            qty: qty || 1,
            measurements: measurements || { width: 1500, height: 1200 }
          }
        ], { orderNo: cardOrderNo });
        if (out) {
          cuttingListRes = out.cuttingList || [];
          glassListRes = out.glassList || [];
          hardwareListRes = out.hardwareList || [];
          totalBomRes = out.totalBomConsumption || [];
          if (processedMeasurements) {
            processedMeasurements.sheetResult = out.sheetResult || null;
          }
        }
      } catch (e) {
        console.warn('Failed to calculate engine output for card save:', e.message);
      }
    }

    const card = new ProductionCard({
      orderId,
      templateId: cardTemplateId,
      customerName: customerName || (template ? template.name : ''),
      projectName: projectName || orderId,
      templateName: templateName || (template ? template.name : ''),
      qty: qty || 1,
      priority: priority || 'Normal',
      notes: notes || '',
      status: status || 'Created',
      productionDate: new Date(),
      measurements: processedMeasurements,
      cuttingList: cuttingListRes,
      glassList: glassListRes,
      hardwareList: hardwareListRes,
      totalBomConsumption: totalBomRes
    });

    await card.save();

    if (orderId) {
      try {
        const order = await Order.findById(orderId);
        if (order) {
          order.status = 'In Production';
          await order.save();
        }
      } catch (err) {
        console.warn('Failed to update order status to In Production:', err.message);
      }
    }
    
    const populatedCard = await populateCard(card);
    res.status(201).json({ message: 'Production Card Created', card: populatedCard });
  } catch (error) {
    console.error('Error manually creating production card:', error);
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
});

// Fetch all production cards
router.get('/cards', async (req, res) => {
  try {
    const cards = await ProductionCard.find();
    
    // Manually populate orderId and templateId
    const populated = await Promise.all(cards.map(async (card) => {
      return await populateCard(card);
    }));

    res.json(populated);
  } catch (error) {
    console.error('Error fetching production cards:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Update Production Card fields (fully editable)
router.put('/cards/:id', async (req, res) => {
  try {
    const updateFields = req.body;
    const card = await ProductionCard.findByIdAndUpdate(
      req.params.id, 
      { $set: updateFields }, 
      { new: true }
    );
    if (!card) return res.status(404).json({ error: 'Card not found' });
    
    if (updateFields.status && card.orderId) {
      try {
        const orderIdKey = typeof card.orderId === 'object' ? (card.orderId._id || card.orderId.id) : card.orderId;
        if (orderIdKey) {
          const query = mongoose.Types.ObjectId.isValid(orderIdKey)
            ? { $or: [{ _id: orderIdKey }, { id: orderIdKey }, { orderNumber: orderIdKey }] }
            : { $or: [{ id: orderIdKey }, { orderNumber: orderIdKey }] };
          await Order.findOneAndUpdate(query, { $set: { status: updateFields.status } });
        }
      } catch (ordErr) {
        console.warn('Could not sync order status from card update:', ordErr.message);
      }
    }

    const populatedCard = await populateCard(card);
    res.json(populatedCard);
  } catch (error) {
    console.error('Error updating production card:', error);
    res.status(500).json({ error: error.message });
  }
});

router.patch('/cards/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Status is required' });

    const card = await ProductionCard.findByIdAndUpdate(
      req.params.id,
      { $set: { status } },
      { new: true }
    );
    if (!card) return res.status(404).json({ error: 'Card not found' });

    if (card.orderId) {
      try {
        const orderIdKey = typeof card.orderId === 'object' ? (card.orderId._id || card.orderId.id) : card.orderId;
        if (orderIdKey) {
          const query = mongoose.Types.ObjectId.isValid(orderIdKey)
            ? { $or: [{ _id: orderIdKey }, { id: orderIdKey }, { orderNumber: orderIdKey }] }
            : { $or: [{ id: orderIdKey }, { orderNumber: orderIdKey }] };
          await Order.findOneAndUpdate(query, { $set: { status } });
        }
      } catch (ordErr) {
        console.warn('Could not sync order status from card update:', ordErr.message);
      }
    }

    const populatedCard = await populateCard(card);
    res.json(populatedCard);
  } catch (error) {
    console.error('Error updating production card status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete Production Card
router.delete('/cards/:id', async (req, res) => {
  try {
    const card = await ProductionCard.findById(req.params.id);
    if (!card) return res.status(404).json({ error: 'Card not found' });

    const orderId = card.orderId;
    await ProductionCard.findByIdAndDelete(req.params.id);

    if (orderId) {
      // Check if there are any other production cards for this order
      const otherCardsCount = await ProductionCard.countDocuments({ orderId, _id: { $ne: req.params.id } });
      if (otherCardsCount === 0) {
        // Revert Order status back to Confirmed
        const order = await Order.findById(orderId);
        if (order) {
          order.status = 'Confirmed';
          await order.save();
        }
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting production card:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
