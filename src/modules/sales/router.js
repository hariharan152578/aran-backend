import express from 'express';
import mongoose from 'mongoose';
import Order from './models/Order.js';
import Quotation from './models/Quotation.js';
import ProfileDescription from './models/ProfileDescription.js';
import Category from '../configuration/models/Category.js';
import QuotationCategory from './models/QuotationCategory.js';
import Invoice from '../accounts/models/Invoice.js';
import Payment from '../accounts/models/Payment.js';
import QuotationSettings from './models/QuotationSettings.js';
import ProductionCard from '../production/models/ProductionCard.js';
import DispatchOrder from '../dispatch/models/DispatchOrder.js';
import Account from '../accounts/models/Account.js';
import AccountTransaction from '../accounts/models/AccountTransaction.js';

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
    } catch (e) { }

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
  const match = trimmed.match(/^(?:Set\s*(\d+)\s*[-:]\s*|S(\d+)[-:]\s*)?([A-Za-z]+)\s*[-_]?\s*(\d{1,4})$/i);
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
  let offset = attemptOffset;
  const latest = await getLatestAlphaOrder();
  while (offset <= 1000) {
    const candidate = computeNextOrderInfo(latest, offset);
    const existing = await Order.findOne({
      $or: [
        { id: candidate.nextId },
        { id: candidate.orderNumber },
        { orderNumber: candidate.orderNumber }
      ]
    });
    if (!existing) {
      return candidate;
    }
    offset++;
  }
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
        // Normalize id if user provided just short "A001" or "AM1"
        if (!orderData.id.includes('Set')) {
          orderData.id = parsed.formattedId;
        }
      }

      // Check if an order already exists with this ID or orderNumber
      const possibleIds = [
        orderData.id,
        orderId,
        orderData.orderNumber
      ].filter(Boolean);

      let existingOrder = await Order.findOne({
        $or: [
          { id: { $in: possibleIds } },
          { orderNumber: { $in: possibleIds } }
        ]
      });

      if (existingOrder) {
        // If it already exists, update the order with the incoming data
        // (handles re-conversion, updating quotation reference, etc.)
        Object.assign(existingOrder, orderData);
        order = await existingOrder.save();
      } else {
        order = new Order(orderData);
        await order.save();
      }
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

router.put('/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const query = mongoose.Types.ObjectId.isValid(id)
      ? { $or: [{ _id: id }, { id }, { orderNumber: id }] }
      : { $or: [{ id }, { orderNumber: id }] };

    const order = await Order.findOneAndUpdate(query, { $set: req.body }, { new: true });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update order', details: err.message });
  }
});

router.patch('/orders/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Status is required' });

    const query = mongoose.Types.ObjectId.isValid(id)
      ? { $or: [{ _id: id }, { id }, { orderNumber: id }] }
      : { $or: [{ id }, { orderNumber: id }] };

    const order = await Order.findOneAndUpdate(query, { $set: { status } }, { new: true });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Synchronize status with any associated production cards
    try {
      const ProductionCard = mongoose.models.ProductionCard || mongoose.model('ProductionCard');
      if (ProductionCard) {
        const cardStatus = (status === 'Dispatched') ? 'Completed' : status;
        await ProductionCard.updateMany(
          {
            $or: [
              { orderId: order._id },
              { orderId: order.id },
              { orderId: order.orderNumber }
            ]
          },
          { $set: { status: cardStatus } }
        );
      }
    } catch (cardErr) {
      console.warn('Could not sync card status:', cardErr.message);
    }

    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update order status', details: err.message });
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

      const customerName = typeof order.party === 'string' ? order.party : (order.party?.name || 'Customer');

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

      // Record a Payment receipt document linked to the matching invoice & order
      const allPmts = await Payment.find({}, { paymentNumber: 1, receiptNumber: 1 });
      let maxNum = 35620;
      for (const p of allPmts) {
        const val = parseInt(p.paymentNumber || p.receiptNumber, 10);
        if (!isNaN(val) && val > maxNum) maxNum = val;
      }
      const paymentNumber = String(maxNum + 1);

      order.transactions = order.transactions || [];
      order.transactions.push({
        amount: numAmount,
        paymentMode: paymentMode || 'Cash',
        date: new Date(),
        reference: paymentNumber
      });

      // Resolve destination account
      const isCashMode = (paymentMode || '').toLowerCase() === 'cash';
      let targetAccount = null;
      if (isCashMode) {
        targetAccount = await Account.findOne({ $or: [{ type: 'Cash' }, { name: /cash/i }] });
        if (!targetAccount) {
          targetAccount = new Account({ name: 'Cash in hand', type: 'Cash', openingBalance: 0 });
          await targetAccount.save();
        }
      } else {
        const reqAcc = req.body.paymentReceivedIn;
        if (reqAcc) {
          targetAccount = await Account.findOne({ name: reqAcc }) || (mongoose.Types.ObjectId.isValid(reqAcc) ? await Account.findById(reqAcc) : null);
        }
        if (!targetAccount || targetAccount.type === 'Cash') {
          targetAccount = await Account.findOne({ type: { $ne: 'Cash' } }) || await Account.findOne();
        }
      }
      const finalAccountName = targetAccount?.name || (isCashMode ? 'Cash in hand' : req.body.paymentReceivedIn || 'Bank');

      const payment = new Payment({
        paymentNumber,
        receiptNumber: paymentNumber,
        partyName: customerName,
        invoiceId: invoice._id,
        settledInvoices: [{
          invoiceId: invoice._id,
          orderId: order._id,
          invoiceNumber: invoice.invoiceNumber,
          orderNumber: order.id || order.orderNumber,
          invoiceAmount: orderTotalAmt,
          amountReceived: numAmount,
          discount: 0,
          date: new Date(),
          type: 'Order'
        }],
        totalAmountSettled: numAmount,
        amountReceived: numAmount,
        amountPaid: numAmount,
        paymentMethod: paymentMode || 'Cash',
        paymentMode: paymentMode || 'Cash',
        paymentReceivedIn: finalAccountName,
        paymentDate: new Date()
      });
      await payment.save();

      // Also create corresponding AccountTransaction so it syncs to Cash & Bank
      if (targetAccount && numAmount > 0) {
        const tx = new AccountTransaction({
          accountId: targetAccount._id,
          accountName: targetAccount.name,
          date: payment.paymentDate || new Date(),
          type: 'Payment In',
          txnNo: paymentNumber,
          partyName: customerName,
          mode: paymentMode || 'Cash',
          receivedAmount: numAmount,
          paidAmount: 0,
          referencePaymentId: payment._id,
          remarks: `Advance for Order ${order.id || order.orderNumber}`
        });
        await tx.save();
      }

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

const generateNextQuotationNumber = async (quoteDate) => {
  const d = quoteDate ? new Date(quoteDate) : new Date();
  const validDate = isNaN(d.getTime()) ? new Date() : d;
  const mm = String(validDate.getMonth() + 1).padStart(2, '0');
  const yy = String(validDate.getFullYear()).slice(-2);
  const prefix = `Q-${mm}${yy}-`;

  const regex = new RegExp(`^Q-${mm}${yy}-(\\d+)`, 'i');
  const quotes = await Quotation.find({ quotationNumber: regex }, { quotationNumber: 1 });

  let maxSeq = 0;
  for (const q of quotes) {
    const match = q.quotationNumber.match(regex);
    if (match && match[1]) {
      const seq = parseInt(match[1], 10);
      if (!isNaN(seq) && seq > maxSeq) {
        maxSeq = seq;
      }
    }
  }

  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
};

router.get('/next-quotation-number', async (req, res) => {
  try {
    const { date } = req.query;
    const nextQuotationNumber = await generateNextQuotationNumber(date);
    res.json({ nextQuotationNumber });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate next quotation number', details: err.message });
  }
});

router.post('/quotations', async (req, res) => {
  try {
    let quotationNumber = req.body.quotationNumber;
    if (!quotationNumber || quotationNumber === 'New Draft' || !quotationNumber.trim()) {
      quotationNumber = await generateNextQuotationNumber(req.body.date);
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
    const oldQuotation = await Quotation.findById(req.params.id);
    const quotation = await Quotation.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!quotation) return res.status(404).json({ error: 'Quotation not found' });

    // Cascading updates to linked Orders, Invoices, Payments, and ProductionCards
    try {
      const quotationAmount = Number(quotation.totalAmount || quotation.amount || 0);
      const customerName = typeof quotation.party === 'string'
        ? quotation.party
        : (quotation.party?.name || 'Customer');

      // 1. Find and update linked Orders
      const orderQueryOr = [];
      if (oldQuotation?.quotationNumber) {
        orderQueryOr.push({ quotationRef: oldQuotation.quotationNumber });
      }
      if (quotation.quotationNumber) {
        orderQueryOr.push({ quotationRef: quotation.quotationNumber });
      }
      if (quotation._id) {
        orderQueryOr.push({ quotationRef: String(quotation._id) });
      }
      if (oldQuotation?._id) {
        orderQueryOr.push({ quotationRef: String(oldQuotation._id) });
      }
      if (quotation.orderRef) {
        orderQueryOr.push({ id: quotation.orderRef });
        orderQueryOr.push({ orderNumber: quotation.orderRef });
        const escapedRef = quotation.orderRef.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        orderQueryOr.push({ id: new RegExp(`\\b${escapedRef}\\b`, 'i') });
      }
      if (oldQuotation?.orderRef) {
        orderQueryOr.push({ id: oldQuotation.orderRef });
        orderQueryOr.push({ orderNumber: oldQuotation.orderRef });
      }

      let linkedOrders = [];
      if (orderQueryOr.length > 0) {
        linkedOrders = await Order.find({ $or: orderQueryOr });
      }

      const orderIds = [];
      const orderKeyIds = [];

      for (const order of linkedOrders) {
        orderIds.push(order._id);
        if (order.id) orderKeyIds.push(order.id);
        if (order.orderNumber) orderKeyIds.push(order.orderNumber);

        // Keep quotationRef synced with the current quotationNumber
        if (quotation.quotationNumber) {
          order.quotationRef = quotation.quotationNumber;
        }

        // Update party, amounts, line items, and accessory charges
        order.party = quotation.party;
        order.amount = quotationAmount;
        order.totalAmount = quotationAmount;
        if (quotation.lineItems && quotation.lineItems.length > 0) {
          order.lineItems = quotation.lineItems;
        }
        if (quotation.extraCharges) {
          order.extraCharges = quotation.extraCharges;
        }
        if (quotation.additionalCharges) {
          order.additionalCharges = quotation.additionalCharges;
        }
        if (quotation.discounts) {
          order.discounts = quotation.discounts;
        }
        if (quotation.subtotal != null) {
          order.subtotal = quotation.subtotal;
        }
        if (quotation.totalSqFt != null) {
          order.totalSqFt = quotation.totalSqFt;
        }
        if (quotation.totalQty != null) {
          order.totalQty = quotation.totalQty;
        }
        if (quotation.taxRate != null) {
          order.taxRate = quotation.taxRate;
        }
        if (quotation.taxAmount != null) {
          order.taxAmount = quotation.taxAmount;
        }
        if (quotation.roundOff != null) {
          order.roundOff = quotation.roundOff;
        }

        // Recalculate payment status on the order
        const paid = Number(order.amountPaid || 0);
        if (paid >= quotationAmount && quotationAmount > 0) {
          order.paymentStatus = 'Paid';
        } else if (paid > 0) {
          order.paymentStatus = 'Partial Paid';
        } else {
          order.paymentStatus = 'Unpaid';
        }

        await order.save();
      }

      // 2. Find and update linked Invoices
      const invoiceQueryOr = [
        { quotationId: quotation._id }
      ];
      if (orderIds.length > 0) {
        invoiceQueryOr.push({ orderId: { $in: orderIds } });
      }
      if (quotation.orderRef) {
        invoiceQueryOr.push({ orderRef: quotation.orderRef });
      }
      for (const k of orderKeyIds) {
        invoiceQueryOr.push({ orderRef: k });
      }

      const linkedInvoices = await Invoice.find({ $or: invoiceQueryOr });

      for (const inv of linkedInvoices) {
        inv.customerName = customerName;
        inv.amount = quotationAmount;
        if (!inv.orderRef && quotation.orderRef) {
          inv.orderRef = quotation.orderRef;
        }

        const rec = Number(inv.amountReceived || 0);
        if (rec >= quotationAmount && quotationAmount > 0) {
          inv.status = 'Paid';
        } else if (rec > 0) {
          inv.status = 'Partially Paid';
        } else {
          inv.status = 'Unpaid';
        }

        await inv.save();

        // 3. Cascade update settled invoice lines in Payment records
        try {
          await Payment.updateMany(
            {
              $or: [
                { invoiceId: inv._id },
                { 'settledInvoices.invoiceId': inv._id }
              ]
            },
            {
              $set: {
                partyName: customerName,
                'settledInvoices.$[elem].invoiceAmount': quotationAmount
              }
            },
            {
              arrayFilters: [{ 'elem.invoiceId': inv._id }]
            }
          );
        } catch (pmtErr) {
          console.warn('Failed to cascade payment update for invoice:', pmtErr.message);
        }
      }

      // 4. Update linked ProductionCards
      const allOrderIdentifiers = [...orderIds, ...orderKeyIds, ...orderIds.map(String)];
      if (allOrderIdentifiers.length > 0) {
        try {
          await ProductionCard.updateMany(
            { orderId: { $in: allOrderIdentifiers } },
            { $set: { customerName } }
          );
        } catch (cardErr) {
          console.warn('Failed to cascade ProductionCard customerName:', cardErr.message);
        }

        // 5. Update linked DispatchOrders
        try {
          await DispatchOrder.updateMany(
            { orderId: { $in: allOrderIdentifiers } },
            {
              $set: {
                customerName,
                ...(quotation.deliveryAddress ? { deliveryAddress: quotation.deliveryAddress } : {})
              }
            }
          );
        } catch (dispErr) {
          console.warn('Failed to cascade DispatchOrder details:', dispErr.message);
        }
      }
    } catch (syncErr) {
      console.error('Error synchronizing quotation updates to linked entities:', syncErr);
    }

    res.json(quotation);
  } catch (err) {
    res.status(400).json({ error: 'Failed to update quotation', details: err.message });
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

// ================= Accessory Defaults =================

router.get('/accessory-defaults', async (req, res) => {
  try {
    let settings = await QuotationSettings.findOne({ key: 'default_accessories' });
    if (!settings) {
      settings = {
        defaultTaxRate: 0,
        packingForwarding: { qty: 0, rate: 0, amount: 0 },
        erectionScrew: { qty: 0, rate: 0, amount: 0 },
        foam: { qty: 0, rate: 0, amount: 0 },
        silicon: { qty: 0, rate: 0, amount: 0 },
        customAccessories: []
      };
    }
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch accessory defaults', details: err.message });
  }
});

router.post('/accessory-defaults', async (req, res) => {
  try {
    const { defaultTaxRate, packingForwarding, erectionScrew, foam, silicon, customAccessories } = req.body;
    const sanitizedCustom = Array.isArray(customAccessories) ? customAccessories.map(ca => {
      const type = ca.type || 'rate';
      const qty = type === 'rate' ? (Number(ca.qty) || 0) : 1;
      const rate = Number(ca.rate) || 0;
      const amount = type === 'rate' ? (qty * rate) : (Number(ca.amount) || rate || 0);
      return {
        id: ca.id || `acc_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        name: ca.name?.trim() || 'Accessory',
        type,
        qty,
        rate,
        amount
      };
    }) : [];

    const settings = await QuotationSettings.findOneAndUpdate(
      { key: 'default_accessories' },
      {
        key: 'default_accessories',
        ...(defaultTaxRate !== undefined ? { defaultTaxRate: Number(defaultTaxRate) || 0 } : {}),
        packingForwarding: {
          qty: Number(packingForwarding?.qty) || 0,
          rate: Number(packingForwarding?.rate) || 0,
          amount: Number(packingForwarding?.amount) || 0
        },
        erectionScrew: {
          qty: Number(erectionScrew?.qty) || 0,
          rate: Number(erectionScrew?.rate) || 0,
          amount: Number(erectionScrew?.amount) || 0
        },
        foam: {
          qty: Number(foam?.qty) || 0,
          rate: Number(foam?.rate) || 0,
          amount: Number(foam?.amount) || 0
        },
        silicon: {
          qty: Number(silicon?.qty) || 0,
          rate: Number(silicon?.rate) || 0,
          amount: Number(silicon?.amount) || 0
        },
        customAccessories: sanitizedCustom
      },
      { upsert: true, new: true }
    );
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save accessory defaults', details: err.message });
  }
});

export default router;
