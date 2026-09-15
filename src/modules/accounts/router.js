import express from 'express';
import Invoice from './models/Invoice.js';
import Payment from './models/Payment.js';
import Expense from './models/Expense.js';
import Order from '../sales/models/Order.js';
import Quotation from '../sales/models/Quotation.js';

const router = express.Router();

// Helper to seed initial invoices from orders
const ensureInvoices = async () => {
  const invoiceCount = await Invoice.countDocuments();
  if (invoiceCount === 0) {
    const orders = await Order.find();
    for (const order of orders) {
      const count = await Invoice.countDocuments();
      const invoiceNumber = `INV-2026-${String(count + 1).padStart(3, '0')}`;
      const inv = new Invoice({
        invoiceNumber,
        orderId: order._id,
        customerName: order.customerName,
        amount: 15000, // mock calculation
        dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000) // 15 days from now
      });
      await inv.save();
    }
  }
};

// INVOICES
router.get('/invoices', async (req, res) => {
  try {
    await ensureInvoices();
    const invoices = await Invoice.find().populate('orderId').populate('quotationId').sort({ createdAt: -1 });

    const enriched = await Promise.all(invoices.map(async (inv) => {
      const invObj = inv.toObject();
      const pms = await Payment.find({ invoiceId: inv._id });
      const totalPmt = pms.reduce((acc, p) => acc + (Number(p.amountPaid) || 0), 0);
      invObj.amountReceived = Math.max(Number(inv.amountReceived) || 0, totalPmt);
      if (invObj.amountReceived >= invObj.amount && invObj.amount > 0) {
        invObj.status = 'Paid';
      } else if (invObj.amountReceived > 0) {
        invObj.status = 'Partially Paid';
      } else {
        invObj.status = 'Unpaid';
      }
      return invObj;
    }));

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/invoices', async (req, res) => {
  try {
    const { quotationId, orderId, customerName, amount, dueDate, amountReceived, paymentMethod } = req.body;
    const count = await Invoice.countDocuments();
    const invoiceNumber = `INV-2026-${String(count + 1).padStart(3, '0')}`;

    const recAmt = Number(amountReceived) || 0;
    const totalAmt = Number(amount) || 0;

    let status = 'Unpaid';
    if (recAmt > 0) {
      if (recAmt >= totalAmt) {
        status = 'Paid';
      } else {
        status = 'Partially Paid';
      }
    }

    const data = new Invoice({
      invoiceNumber,
      quotationId,
      orderId,
      customerName,
      amount: totalAmt,
      amountReceived: recAmt,
      paymentMethod: paymentMethod || 'Bank Transfer',
      dueDate,
      status
    });
    await data.save();

    if (recAmt > 0) {
      const pmtCount = await Payment.countDocuments();
      const receiptNumber = `RCPT-2026-${String(pmtCount + 1).padStart(3, '0')}`;
      const payment = new Payment({
        receiptNumber,
        invoiceId: data._id,
        amountPaid: recAmt,
        paymentMethod: paymentMethod || 'Bank Transfer'
      });
      await payment.save();
    }

    res.status(201).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PAYMENTS
router.get('/payments', async (req, res) => {
  try {
    const data = await Payment.find().populate('invoiceId').sort({ createdAt: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/payments', async (req, res) => {
  try {
    const { invoiceId, amountPaid, paymentMethod } = req.body;
    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const count = await Payment.countDocuments();
    const receiptNumber = `RCPT-2026-${String(count + 1).padStart(3, '0')}`;
    const pmtAmt = Number(amountPaid) || 0;

    const payment = new Payment({
      receiptNumber,
      invoiceId,
      amountPaid: pmtAmt,
      paymentMethod
    });
    await payment.save();

    // Increment amountReceived and recalculate status
    invoice.amountReceived = (Number(invoice.amountReceived) || 0) + pmtAmt;
    if (invoice.amountReceived >= invoice.amount) {
      invoice.status = 'Paid';
    } else if (invoice.amountReceived > 0) {
      invoice.status = 'Partially Paid';
    }
    await invoice.save();

    res.status(201).json(payment);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// EXPENSES
router.get('/expenses', async (req, res) => {
  try {
    const data = await Expense.find().sort({ date: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/expenses', async (req, res) => {
  try {
    const count = await Expense.countDocuments();
    const expenseNumber = `EXP-2026-${String(count + 1).padStart(3, '0')}`;
    const data = new Expense({ ...req.body, expenseNumber });
    await data.save();
    res.status(201).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
