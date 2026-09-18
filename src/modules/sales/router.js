import express from 'express';
import mongoose from 'mongoose';
import Order from './models/Order.js';
import Quotation from './models/Quotation.js';
import ProfileDescription from './models/ProfileDescription.js';
import Category from '../configuration/models/Category.js';
import QuotationCategory from './models/QuotationCategory.js';
import Invoice from '../accounts/models/Invoice.js';
import Payment from '../accounts/models/Payment.js';

const router = express.Router();

router.get('/orders', async (req, res) => {
  try {
    const { set, series, status, search } = req.query;
    let filter = {};

    if (set && set !== 'All') {
      const setNum = parseInt(set, 10);
      if (!isNaN(setNum)) {
        filter.$or = [
          { setNumber: setNum },
          { id: new RegExp(`Set\\s*${setNum}\\b`, 'i') }
        ];
      }
    }

    if (series && series !== 'All') {
      const s = series.toUpperCase();
      const seriesCondition = [
        { series: s },
        { orderNumber: new RegExp(`^${s}\\d`, 'i') },
        { id: new RegExp(`-\\s*${s}\\d`, 'i') }
      ];
      if (filter.$or) {
        filter = { $and: [{ $or: filter.$or }, { $or: seriesCondition }] };
      } else {
        filter.$or = seriesCondition;
      }
    }

    if (status && status !== 'All') {
      filter.status = status;
    }

    if (search && search.trim()) {
      const term = search.trim();
      const searchCond = [
        { id: { $regex: term, $options: 'i' } },
        { orderNumber: { $regex: term, $options: 'i' } },
        { quotationRef: { $regex: term, $options: 'i' } },
        { 'party.name': { $regex: term, $options: 'i' } },
        { party: { $regex: term, $options: 'i' } }
      ];
      if (filter.$and) {
        filter.$and.push({ $or: searchCond });
      } else if (filter.$or) {
        filter = { $and: [{ $or: filter.$or }, { $or: searchCond }] };
      } else {
        filter.$or = searchCond;
      }
    }

    const orders = await Order.find(filter).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders', details: err.message });
  }
});

// PROFILE DESCRIPTIONS (Root Categories in Configuration Explorer)
router.get('/profile-descriptions', async (req, res) => {
  try {
    const rootCategories = await Category.find({ parentId: null }).sort({ name: 1 });
    const profileDescriptions = await ProfileDescription.find().sort({ name: 1 });
    
    const seen = new Set();
    const result = [];
    
    rootCategories.forEach(c => {
      const lower = c.name.trim().toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        result.push({ _id: c._id, name: c.name });
      }
    });
    
    profileDescriptions.forEach(p => {
      const lower = p.name.trim().toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        result.push({ _id: p._id, name: p.name });
      }
    });
    
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile descriptions', details: err.message });
  }
});

router.post('/profile-descriptions', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    const trimmed = name.trim();
    
    // Check if category exists
    let existing = await Category.findOne({ 
      parentId: null,
      name: { $regex: new RegExp(`^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } 
    });
    if (!existing) {
      existing = await ProfileDescription.findOne({ 
        name: { $regex: new RegExp(`^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } 
      });
    }
    if (existing) {
      return res.status(400).json({ error: 'Profile description already exists' });
    }

    // Create root Category
    const category = new Category({ name: trimmed, parentId: null, path: trimmed });
    await category.save();

    // Also sync in ProfileDescription
    try {
      await ProfileDescription.findOneAndUpdate(
        { name: { $regex: new RegExp(`^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
        { name: trimmed },
        { upsert: true }
      );
    } catch (e) {}

    res.status(201).json({ _id: category._id, name: category.name });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create profile description', details: err.message });
  }
});

// QUOTATION CATEGORIES
router.get('/quotation-categories', async (req, res) => {
  try {
    const categories = await QuotationCategory.find().sort({ name: 1 });
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch quotation categories', details: err.message });
  }
});

router.post('/quotation-categories', async (req, res) => {
  try {
    const { name, termsAndConditions, customColumns } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    
    const existing = await QuotationCategory.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (existing) {
      return res.status(400).json({ error: 'Quotation category already exists' });
    }

    const category = new QuotationCategory({ 
      name,
      termsAndConditions: termsAndConditions || '',
      customColumns: customColumns || []
    });
    await category.save();
    res.status(201).json(category);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create quotation category', details: err.message });
  }
});

router.delete('/quotation-categories/:id', async (req, res) => {
  try {
    const category = await QuotationCategory.findByIdAndDelete(req.params.id);
    if (!category) return res.status(404).json({ error: 'Quotation category not found' });
    res.json({ message: 'Quotation category deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete quotation category', details: err.message });
  }
});

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function parseOrderId(idStr) {
  if (!idStr || typeof idStr !== 'string') return null;
  const trimmed = idStr.trim();
  const match = trimmed.match(/^(?:Set\s*(\d+)\s*[-:]\s*|S(\d+)[-:]\s*)?([A-Za-z])\s*(\d{1,3})$/i);
  if (match) {
    const setNum = parseInt(match[1] || match[2] || '1', 10);
    const series = match[3].toUpperCase();
    const seq = parseInt(match[4], 10);
    const orderNumber = `${series}${String(seq).padStart(3, '0')}`;
    const formattedId = `Set ${setNum} - ${orderNumber}`;
    return {
      setNumber: setNum,
      setLabel: `Set ${setNum}`,
      series,
      sequenceNumber: seq,
      orderNumber,
      formattedId
    };
  }
  return null;
}

async function getLatestAlphaOrder() {
  const orders = await Order.find({
    $or: [
      { series: { $exists: true, $ne: null } },
      { id: /(?:Set\s*\d+\s*[-:]\s*)?[A-Za-z]\d{1,3}/i }
    ]
  }).sort({ setNumber: -1, series: -1, sequenceNumber: -1, _id: -1 }).limit(10);

  for (const ord of orders) {
    if (ord.series && ord.sequenceNumber && ord.setNumber) {
      return {
        setNumber: ord.setNumber,
        series: ord.series.toUpperCase(),
        sequenceNumber: ord.sequenceNumber
      };
    }
    const parsed = parseOrderId(ord.id || ord.orderNumber);
    if (parsed) {
      return {
        setNumber: parsed.setNumber,
        series: parsed.series,
        sequenceNumber: parsed.sequenceNumber
      };
    }
  }
  return null;
}

function computeNextOrderInfo(latest, offset = 1) {
  let set = latest ? latest.setNumber : 1;
  let letterIdx = latest ? ALPHABET.indexOf(latest.series) : 0;
  if (letterIdx === -1) letterIdx = 0;
  let seq = latest ? latest.sequenceNumber : 0;

  for (let i = 0; i < offset; i++) {
    seq += 1;
    if (seq > 999) {
      seq = 1;
      letterIdx += 1;
      if (letterIdx >= ALPHABET.length) {
        letterIdx = 0;
        set += 1;
      }
    }
  }

  const series = ALPHABET[letterIdx];
  const orderNumber = `${series}${String(seq).padStart(3, '0')}`;
  const nextId = `Set ${set} - ${orderNumber}`;

  return {
    nextId,
    shortId: orderNumber,
    orderNumber,
    setNumber: set,
    setLabel: `Set ${set}`,
    series,
    sequenceNumber: seq
  };
}

async function getNextOrderIdInfo(attemptOffset = 1) {
  const latest = await getLatestAlphaOrder();
  return computeNextOrderInfo(latest, attemptOffset);
}

router.get('/orders/next-id', async (req, res) => {
  try {
    const nextInfo = await getNextOrderIdInfo(1);
    res.json(nextInfo);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch next order ID', details: err.message });
  }
});

router.get('/orders/set-stats', async (req, res) => {
  try {
    const orders = await Order.find().lean();
    const setsMap = {};
    const seriesCounts = {};
    ALPHABET.forEach(letter => { seriesCounts[letter] = 0; });

    orders.forEach(o => {
      let set = o.setNumber;
      let series = o.series;
      let seq = o.sequenceNumber;

      if (!series || !set) {
        const parsed = parseOrderId(o.id || o.orderNumber);
        if (parsed) {
          set = parsed.setNumber;
          series = parsed.series;
          seq = parsed.sequenceNumber;
        }
      }

      if (set && series) {
        series = series.toUpperCase();
        if (!setsMap[set]) {
          setsMap[set] = {
            setNumber: set,
            setLabel: `Set ${set}`,
            totalOrders: 0,
            totalAmount: 0,
            seriesCounts: {}
          };
          ALPHABET.forEach(l => { setsMap[set].seriesCounts[l] = 0; });
        }
        setsMap[set].totalOrders++;
        setsMap[set].totalAmount += (o.totalAmount || o.amount || 0);
        setsMap[set].seriesCounts[series] = (setsMap[set].seriesCounts[series] || 0) + 1;
        seriesCounts[series] = (seriesCounts[series] || 0) + 1;
      }
    });

    const nextInfo = await getNextOrderIdInfo(1);
    const currentSet = nextInfo.setNumber;
    const currentSeries = nextInfo.series;
    const currentSequence = nextInfo.sequenceNumber;

    const activeSetOrdersCount = setsMap[currentSet]?.totalOrders || 0;
    const setCapacity = 26 * 999; // 25,974

    res.json({
      currentSet,
      currentSetLabel: `Set ${currentSet}`,
      currentSeries,
      currentSequence,
      nextOrderNumber: nextInfo.orderNumber,
      nextOrderId: nextInfo.nextId,
      totalOrders: orders.length,
      setCapacity,
      activeSetOrdersCount,
      activeSetProgressPercent: Number(((activeSetOrdersCount / setCapacity) * 100).toFixed(2)),
      isSetCompleted: nextInfo.setNumber > 1,
      sets: Object.values(setsMap).sort((a, b) => a.setNumber - b.setNumber),
      seriesCounts
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch set stats', details: err.message });
  }
});

router.post('/orders', async (req, res) => {
  try {
    let orderId = req.body.id;
    let order;

    if (!orderId || orderId === 'New Draft') {
      let isUnique = false;
      let attempt = 1;
      
      while (!isUnique && attempt <= 10) {
        const nextInfo = await getNextOrderIdInfo(attempt);
        orderId = nextInfo.nextId;
        try {
          const orderData = { 
            ...req.body, 
            id: orderId,
            orderNumber: nextInfo.orderNumber,
            setNumber: nextInfo.setNumber,
            setLabel: nextInfo.setLabel,
            series: nextInfo.series,
            sequenceNumber: nextInfo.sequenceNumber
          };
          order = new Order(orderData);
          await order.save();
          isUnique = true; 
        } catch (saveErr) {
          if (saveErr.code === 11000) {
            attempt++;
          } else {
            throw saveErr;
          }
        }
      }
      if (!isUnique) throw new Error('Failed to generate unique Order ID');
    } else {
      const parsed = parseOrderId(orderId);
      const orderData = { ...req.body, id: orderId };
      if (parsed) {
        orderData.orderNumber = parsed.orderNumber;
        orderData.setNumber = parsed.setNumber;
        orderData.setLabel = parsed.setLabel;
        orderData.series = parsed.series;
        orderData.sequenceNumber = parsed.sequenceNumber;
        // Normalize id if user provided just short "A001"
        if (!orderData.id.includes('Set')) {
          orderData.id = parsed.formattedId;
        }
      }
      order = new Order(orderData);
      await order.save();
    }

    res.status(201).json(order);
  } catch (err) {
    res.status(400).json({ error: 'Failed to create order', details: err.message });
  }
});

router.get('/orders/:id', async (req, res) => {
  try {
    // Match by Mongo _id when valid, otherwise by the human-readable `id` field.
    const { id } = req.params;
    const query = mongoose.Types.ObjectId.isValid(id)
      ? { $or: [{ _id: id }, { id }] }
      : { id };
    const order = await Order.findOne(query);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch order', details: err.message });
  }
});

router.put('/orders/:id/payment', async (req, res) => {
  try {
    const { amount, paymentMode, paymentStatus } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Handle manual status override
    if (paymentStatus && !amount) {
      order.paymentStatus = paymentStatus;
    } 
    // Handle adding a transaction
    else if (amount) {
      const numAmount = Number(amount);
      order.transactions.push({ amount: numAmount, paymentMode });
      order.amountPaid += numAmount;

      const orderTotalAmt = order.totalAmount || order.amount || 0;
      if (order.amountPaid >= orderTotalAmt && orderTotalAmt > 0) {
        order.paymentStatus = 'Paid';
      } else if (order.amountPaid > 0) {
        order.paymentStatus = 'Partial Paid';
      } else {
        order.paymentStatus = 'Unpaid';
      }

      // Synchronize/Create matching Invoice & Payment Receipt in Accounts
      let invoice = await Invoice.findOne({ 
        $or: [
          { orderId: order._id },
          { orderRef: order.id },
          { invoiceNumber: order.id }
        ]
      });

      if (!invoice && order.quotationRef) {
        const quote = await Quotation.findOne({
          $or: [
            { quotationNumber: order.quotationRef },
            { id: order.quotationRef }
          ]
        });
        if (quote) {
          invoice = await Invoice.findOne({ quotationId: quote._id });
        }
      }

      if (!invoice) {
        let quotationId = null;
        if (order.quotationRef) {
          const quote = await Quotation.findOne({
            $or: [
              { quotationNumber: order.quotationRef },
              { id: order.quotationRef }
            ]
          });
          if (quote) quotationId = quote._id;
        }

        const customerName = typeof order.party === 'string' ? order.party : (order.party?.name || 'Customer');
        const count = await Invoice.countDocuments();
        const invoiceNumber = `INV-2026-${String(count + 1).padStart(3, '0')}`;
        const defaultDue = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);

        invoice = new Invoice({
          invoiceNumber,
          quotationId,
          orderId: order._id,
          customerName,
          amount: orderTotalAmt,
          amountReceived: 0,
          paymentMethod: paymentMode || 'Cash',
          dueDate: defaultDue,
          status: 'Unpaid'
        });
        await invoice.save();
      }

      // Record a Payment receipt document linked to the matching invoice
      const pmtCount = await Payment.countDocuments();
      const receiptNumber = `RCPT-2026-${String(pmtCount + 1).padStart(3, '0')}`;
      const payment = new Payment({
        receiptNumber,
        invoiceId: invoice._id,
        amountPaid: numAmount,
        paymentMethod: paymentMode || 'Cash',
        paymentDate: new Date()
      });
      await payment.save();

      // Update matching invoice amounts & status
      invoice.amountReceived = (Number(invoice.amountReceived) || 0) + numAmount;
      if (invoice.amountReceived >= invoice.amount) {
        invoice.status = 'Paid';
      } else if (invoice.amountReceived > 0) {
        invoice.status = 'Partially Paid';
      } else {
        invoice.status = 'Unpaid';
      }
      await invoice.save();
    }

    await order.save();
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update payment details', details: err.message });
  }
});

// ================= Quotation Routes =================

router.get('/quotations', async (req, res) => {
  try {
    const quotations = await Quotation.find().sort({ createdAt: -1 });
    res.json(quotations);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch quotations' });
  }
});

router.post('/quotations', async (req, res) => {
  try {
    let quotationNumber = req.body.quotationNumber;
    if (!quotationNumber || quotationNumber === 'New Draft') {
      const count = await Quotation.countDocuments();
      quotationNumber = `QT-2026-${String(count + 1).padStart(3, '0')}`;
    }
    const data = { ...req.body, quotationNumber };
    const quotation = new Quotation(data);
    await quotation.save();
    res.status(201).json(quotation);
  } catch (err) {
    res.status(400).json({ error: 'Failed to create quotation', details: err.message });
  }
});

router.put('/quotations/:id', async (req, res) => {
  try {
    const quotation = await Quotation.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!quotation) return res.status(404).json({ error: 'Quotation not found' });
    res.json(quotation);
  } catch (err) {
    res.status(400).json({ error: 'Failed to update quotation' });
  }
});

router.delete('/quotations/:id', async (req, res) => {
  try {
    await Quotation.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete quotation' });
  }
});

export default router;
