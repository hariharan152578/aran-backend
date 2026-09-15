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
    const orders = await Order.find().sort({ createdAt: -1 });
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

async function getNextOrderId(attemptOffset = 1) {
  const lastOrder = await Order.findOne({ id: /^ORD-/ }).sort({ _id: -1 });
  if (lastOrder && lastOrder.id) {
    const match = lastOrder.id.match(/ORD-\d{4}-(\d+)/);
    if (match) {
      const nextNum = parseInt(match[1], 10) + attemptOffset;
      return `ORD-2026-${String(nextNum).padStart(3, '0')}`;
    }
  }
  const count = await Order.countDocuments();
  return `ORD-2026-${String(count + attemptOffset).padStart(3, '0')}`;
}

router.get('/orders/next-id', async (req, res) => {
  try {
    const nextId = await getNextOrderId(1);
    res.json({ nextId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch next order ID', details: err.message });
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
        orderId = await getNextOrderId(attempt);
        try {
          const orderData = { ...req.body, id: orderId };
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
      const orderData = { ...req.body, id: orderId };
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
