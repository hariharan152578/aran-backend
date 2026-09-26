import express from 'express';
import mongoose from 'mongoose';
import Invoice from './models/Invoice.js';
import Payment from './models/Payment.js';
import Expense from './models/Expense.js';
import Account from './models/Account.js';
import AccountTransaction from './models/AccountTransaction.js';
import Order from '../sales/models/Order.js';
import Quotation from '../sales/models/Quotation.js';

const router = express.Router();

// INVOICES
router.get('/invoices', async (req, res) => {
  try {
    const invoices = await Invoice.find().populate('orderId').populate('quotationId').sort({ createdAt: -1 });

    const enriched = await Promise.all(invoices.map(async (inv) => {
      const invObj = inv.toObject();
      const pms = await Payment.find({
        $or: [
          { invoiceId: inv._id },
          { 'settledInvoices.invoiceId': inv._id }
        ]
      });
      let totalPmt = 0;
      for (const p of pms) {
        if (p.settledInvoices && p.settledInvoices.length > 0) {
          const item = p.settledInvoices.find(s => String(s.invoiceId) === String(inv._id));
          if (item) totalPmt += (Number(item.amountReceived) || 0);
          else if (String(p.invoiceId) === String(inv._id)) totalPmt += (Number(p.amountReceived || p.amountPaid) || 0);
        } else if (String(p.invoiceId) === String(inv._id)) {
          totalPmt += (Number(p.amountReceived || p.amountPaid) || 0);
        }
      }
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
    const { quotationId, orderId, customerName, amount, dueDate, amountReceived, paymentMethod, paymentReceivedIn } = req.body;
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
      const allPmts = await Payment.find({}, { paymentNumber: 1, receiptNumber: 1 });
      let maxNum = 35620;
      for (const p of allPmts) {
        const val = parseInt(p.paymentNumber || p.receiptNumber, 10);
        if (!isNaN(val) && val > maxNum) maxNum = val;
      }
      const paymentNumber = String(maxNum + 1);

      // Resolve destination account
      let targetAccount = null;
      if (paymentReceivedIn) {
        targetAccount = await Account.findOne({ name: paymentReceivedIn }) || 
          (mongoose.Types.ObjectId.isValid(paymentReceivedIn) ? await Account.findById(paymentReceivedIn) : null);
      }
      if (!targetAccount) {
        if ((paymentMethod || '').toLowerCase() === 'cash') {
          targetAccount = await Account.findOne({ $or: [{ type: 'Cash' }, { name: /cash/i }] });
        } else {
          targetAccount = await Account.findOne({ isDefault: true }) || await Account.findOne({ type: 'Bank' }) || await Account.findOne();
        }
      }

      const finalReceivedIn = targetAccount?.name || paymentReceivedIn || (paymentMethod === 'Cash' ? 'Cash in hand' : '');

      const payment = new Payment({
        paymentNumber,
        receiptNumber: paymentNumber,
        partyName: customerName,
        invoiceId: data._id,
        settledInvoices: [{
          invoiceId: data._id,
          invoiceNumber: data.invoiceNumber,
          invoiceAmount: totalAmt,
          amountReceived: recAmt,
          discount: 0,
          date: data.createdAt,
          dueDate: data.dueDate
        }],
        totalAmountSettled: recAmt,
        amountReceived: recAmt,
        amountPaid: recAmt,
        paymentMethod: paymentMethod || 'Bank Transfer',
        paymentMode: paymentMethod || 'Bank Transfer',
        paymentReceivedIn: finalReceivedIn
      });
      await payment.save();

      if (targetAccount) {
        const tx = new AccountTransaction({
          accountId: targetAccount._id,
          accountName: targetAccount.name,
          date: payment.paymentDate || new Date(),
          type: 'Payment In',
          txnNo: paymentNumber,
          partyName: customerName || 'Customer',
          mode: payment.paymentMode || 'Bank Transfer',
          receivedAmount: recAmt,
          paidAmount: 0,
          referencePaymentId: payment._id,
          remarks: `Initial payment on Invoice ${data.invoiceNumber}`
        });
        await tx.save();
      }
    }

    res.status(201).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PAYMENTS
router.get('/payments/next-number', async (req, res) => {
  try {
    const allPmts = await Payment.find({}, { paymentNumber: 1, receiptNumber: 1 });
    let maxNum = 35620;
    for (const p of allPmts) {
      const val = parseInt(p.paymentNumber || p.receiptNumber, 10);
      if (!isNaN(val) && val > maxNum) maxNum = val;
    }
    res.json({ nextNumber: String(maxNum + 1) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/payments', async (req, res) => {
  try {
    const data = await Payment.find()
      .populate('invoiceId')
      .populate('customerId')
      .populate('settledInvoices.invoiceId')
      .populate('settledInvoices.orderId')
      .sort({ createdAt: -1 });

    // Also include order transactions that may have been recorded on orders
    const ordersWithTx = await Order.find({ 'transactions.0': { $exists: true } });
    const existingPmtRefs = new Set();
    const existingSettledOrderIds = new Set();
    const existingSettledOrderNumbers = new Set();

    data.forEach(p => {
      if (p.paymentNumber) existingPmtRefs.add(String(p.paymentNumber).trim());
      if (p.receiptNumber) existingPmtRefs.add(String(p.receiptNumber).trim());
      (p.settledInvoices || []).forEach(si => {
        const ordId = si.orderId?._id || si.orderId;
        if (ordId) existingSettledOrderIds.add(String(ordId));
        if (si.orderNumber) existingSettledOrderNumbers.add(String(si.orderNumber).trim());
      });
      if (p.invoiceId?.orderId) {
        const invOrdId = p.invoiceId.orderId._id || p.invoiceId.orderId;
        if (invOrdId) existingSettledOrderIds.add(String(invOrdId));
      }
    });

    const synthesizedPayments = [];
    for (const order of ordersWithTx) {
      const partyName = typeof order.party === 'string' ? order.party : (order.party?.name || 'Customer');
      (order.transactions || []).forEach((t, tIdx) => {
        const refNum = t.reference || `PMT-${order.orderNumber || order.id || order._id}-${tIdx + 1}`;
        
        // Skip if this transaction reference already exists in Payment documents
        if (t.reference && existingPmtRefs.has(String(t.reference).trim())) return;
        if (existingPmtRefs.has(String(refNum).trim())) return;

        // Skip if this order already has payments in Payment collection
        if (existingSettledOrderIds.has(String(order._id)) || existingSettledOrderNumbers.has(String(order.id || order.orderNumber || '').trim())) {
          return;
        }

        synthesizedPayments.push({
          _id: `ord-tx-${order._id}-${tIdx}`,
          paymentNumber: refNum,
          receiptNumber: refNum,
          partyName,
          totalAmountSettled: t.amount || 0,
          amountReceived: t.amount || 0,
          amountPaid: t.amount || 0,
          discount: 0,
          paymentDate: t.date || order.createdAt,
          createdAt: t.date || order.createdAt,
          paymentMode: t.paymentMode || 'Cash',
          paymentMethod: t.paymentMode || 'Cash',
          paymentReceivedIn: t.paymentMode === 'Cash' ? 'Cash in hand' : 'Bank',
          notes: `Payment for Order ${order.id || order.orderNumber}`,
          settledInvoices: [{
            orderId: order._id,
            orderNumber: order.id || order.orderNumber,
            invoiceAmount: order.totalAmount || order.amount || t.amount,
            amountReceived: t.amount || 0,
            type: 'Order',
            date: order.createdAt
          }],
          isOrderTransaction: true
        });
      });
    }

    const allPayments = [...data, ...synthesizedPayments].sort((a, b) => {
      const da = new Date(a.paymentDate || a.createdAt || 0);
      const db = new Date(b.paymentDate || b.createdAt || 0);
      return db - da;
    });

    res.json(allPayments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/payments/:id', async (req, res) => {
  try {
    const data = await Payment.findById(req.params.id)
      .populate('invoiceId')
      .populate('customerId')
      .populate('settledInvoices.invoiceId')
      .populate('settledInvoices.orderId');
    if (!data) return res.status(404).json({ error: 'Payment not found' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/payments', async (req, res) => {
  try {
    const {
      paymentNumber,
      partyName,
      customerId,
      invoiceId,
      settledInvoices = [],
      totalAmountSettled,
      amountReceived,
      amountPaid,
      discount,
      paymentDate,
      paymentMethod,
      paymentMode,
      paymentReceivedIn,
      notes
    } = req.body;

    const actualAmount = Number(amountReceived ?? amountPaid ?? 0);
    const actualMode = paymentMode || paymentMethod || 'Cash';

    // Auto-generate payment number if not provided
    let num = paymentNumber;
    if (!num) {
      const allPmts = await Payment.find({}, { paymentNumber: 1, receiptNumber: 1 });
      let maxNum = 35620;
      for (const p of allPmts) {
        const val = parseInt(p.paymentNumber || p.receiptNumber, 10);
        if (!isNaN(val) && val > maxNum) maxNum = val;
      }
      num = String(maxNum + 1);
    }

    let actualPartyName = partyName;
    let actualSettledInvoices = Array.isArray(settledInvoices) ? [...settledInvoices] : [];

    // Handle legacy single invoice or single order
    if (invoiceId && actualSettledInvoices.length === 0) {
      const singleInv = await Invoice.findById(invoiceId);
      if (singleInv) {
        if (!actualPartyName) actualPartyName = singleInv.customerName;
        actualSettledInvoices.push({
          invoiceId: singleInv._id,
          invoiceNumber: singleInv.invoiceNumber,
          invoiceAmount: singleInv.amount,
          amountReceived: actualAmount,
          discount: Number(discount) || 0,
          date: singleInv.createdAt,
          dueDate: singleInv.dueDate,
          type: 'Invoice'
        });
      } else {
        const singleOrd = await Order.findById(invoiceId);
        if (singleOrd) {
          if (!actualPartyName) actualPartyName = typeof singleOrd.party === 'string' ? singleOrd.party : (singleOrd.party?.name || 'Customer');
          actualSettledInvoices.push({
            orderId: singleOrd._id,
            orderNumber: singleOrd.id || singleOrd.orderNumber,
            invoiceAmount: singleOrd.totalAmount || singleOrd.amount || 0,
            amountReceived: actualAmount,
            discount: Number(discount) || 0,
            date: singleOrd.createdAt,
            dueDate: new Date(Date.now() + 15 * 86400000),
            type: 'Order'
          });
        }
      }
    }

    // Allocate & settle invoices and orders
    let settledSum = 0;
    for (const item of actualSettledInvoices) {
      const itemAmt = Number(item.amountReceived) || 0;
      settledSum += itemAmt;

      // Check if item is an Order
      let order = null;
      if (item.type === 'Order' || item.orderId) {
        order = await Order.findById(item.orderId || item.invoiceId) ||
          await Order.findOne({ $or: [{ id: item.orderNumber || item.invoiceNumber }, { orderNumber: item.orderNumber || item.invoiceNumber }] });
      }

      // If not resolved as Order, check invoiceId
      let inv = null;
      if (!order && item.invoiceId) {
        inv = await Invoice.findById(item.invoiceId);
        if (!inv) {
          order = await Order.findById(item.invoiceId);
        }
      }

      // Settle Order
      if (order) {
        item.orderId = order._id;
        item.orderNumber = order.id || order.orderNumber;
        item.type = 'Order';

        order.amountPaid = (Number(order.amountPaid) || 0) + itemAmt;
        const totalOrdAmt = Number(order.totalAmount || order.amount || 0);
        if (order.amountPaid >= totalOrdAmt && totalOrdAmt > 0) {
          order.paymentStatus = 'Paid';
        } else if (order.amountPaid > 0) {
          order.paymentStatus = 'Partial Paid';
        } else {
          order.paymentStatus = 'Unpaid';
        }

        order.transactions = order.transactions || [];
        order.transactions.push({
          amount: itemAmt,
          paymentMode: actualMode,
          date: paymentDate ? new Date(paymentDate) : new Date(),
          reference: num
        });
        await order.save();

        // Create or update matching Invoice
        inv = await Invoice.findOne({
          $or: [
            { orderId: order._id },
            { orderRef: order.id },
            { invoiceNumber: order.id }
          ]
        });

        if (!inv) {
          const invCount = await Invoice.countDocuments();
          inv = new Invoice({
            invoiceNumber: order.id || `INV-2026-${String(invCount + 1).padStart(3, '0')}`,
            orderId: order._id,
            orderRef: order.id,
            customerName: actualPartyName || (typeof order.party === 'string' ? order.party : (order.party?.name || 'Customer')),
            amount: totalOrdAmt || itemAmt,
            amountReceived: itemAmt,
            status: order.paymentStatus,
            dueDate: new Date(Date.now() + 15 * 86400000),
            paymentMethod: actualMode
          });
          await inv.save();
        } else {
          inv.amountReceived = (Number(inv.amountReceived) || 0) + itemAmt;
          inv.status = (inv.amountReceived >= inv.amount && inv.amount > 0) ? 'Paid' : (inv.amountReceived > 0 ? 'Partially Paid' : 'Unpaid');
          await inv.save();
        }
        item.invoiceId = inv._id;
        item.invoiceNumber = inv.invoiceNumber;
      } 
      // Settle standalone Invoice
      else if (inv) {
        inv.amountReceived = (Number(inv.amountReceived) || 0) + itemAmt;
        if (inv.amountReceived >= inv.amount && inv.amount > 0) {
          inv.status = 'Paid';
        } else if (inv.amountReceived > 0) {
          inv.status = 'Partially Paid';
        }
        await inv.save();

        if (inv.orderId) {
          const linkedOrder = await Order.findById(inv.orderId);
          if (linkedOrder) {
            linkedOrder.amountPaid = (Number(linkedOrder.amountPaid) || 0) + itemAmt;
            const totalOrdAmt = Number(linkedOrder.totalAmount || linkedOrder.amount || 0);
            if (linkedOrder.amountPaid >= totalOrdAmt && totalOrdAmt > 0) {
              linkedOrder.paymentStatus = 'Paid';
            } else if (linkedOrder.amountPaid > 0) {
              linkedOrder.paymentStatus = 'Partial Paid';
            }
            linkedOrder.transactions = linkedOrder.transactions || [];
            linkedOrder.transactions.push({
              amount: itemAmt,
              paymentMode: actualMode,
              date: paymentDate ? new Date(paymentDate) : new Date(),
              reference: num
            });
            await linkedOrder.save();
          }
        }
      }
    }

    // Resolve destination account
    const isCashMode = actualMode.toLowerCase() === 'cash';
    let targetAccount = null;

    if (isCashMode) {
      targetAccount = await Account.findOne({ $or: [{ type: 'Cash' }, { name: /cash/i }] });
      if (!targetAccount) {
        targetAccount = new Account({
          name: 'Cash in hand',
          type: 'Cash',
          openingBalance: 0,
          asOfDate: new Date(),
          isDefault: false
        });
        await targetAccount.save();
      }
    } else {
      if (paymentReceivedIn) {
        targetAccount = await Account.findOne({ name: paymentReceivedIn }) ||
          (mongoose.Types.ObjectId.isValid(paymentReceivedIn) ? await Account.findById(paymentReceivedIn) : null);
      }
      if (!targetAccount || targetAccount.type === 'Cash') {
        targetAccount = await Account.findOne({ type: { $ne: 'Cash' } }) || await Account.findOne();
      }
    }

    const finalAccountName = targetAccount?.name || (isCashMode ? 'Cash in hand' : paymentReceivedIn || 'Bank');

    const payment = new Payment({
      paymentNumber: num,
      receiptNumber: num,
      partyName: actualPartyName || 'Valued Customer',
      customerId,
      invoiceId: invoiceId || (actualSettledInvoices[0]?.invoiceId),
      settledInvoices: actualSettledInvoices,
      totalAmountSettled: totalAmountSettled != null ? Number(totalAmountSettled) : settledSum,
      amountReceived: actualAmount,
      amountPaid: actualAmount,
      discount: Number(discount) || 0,
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      paymentMethod: actualMode,
      paymentMode: actualMode,
      paymentReceivedIn: finalAccountName,
      notes: notes || ''
    });

    await payment.save();

    // Create corresponding AccountTransaction in Cash & Bank
    if (targetAccount && actualAmount > 0) {
      const tx = new AccountTransaction({
        accountId: targetAccount._id,
        accountName: targetAccount.name,
        date: payment.paymentDate || new Date(),
        type: 'Payment In',
        txnNo: num,
        partyName: actualPartyName || 'Valued Customer',
        mode: actualMode,
        receivedAmount: actualAmount,
        paidAmount: 0,
        referencePaymentId: payment._id,
        remarks: notes || (actualSettledInvoices.length > 0 ? `Settled ${actualSettledInvoices.length} invoice(s)` : '')
      });
      await tx.save();
    }

    res.status(201).json(payment);
  } catch (err) {
    console.error('Payment creation error:', err);
    res.status(400).json({ error: err.message });
  }
});

router.put('/payments/:id', async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    const {
      paymentDate,
      paymentMode,
      paymentMethod,
      paymentReceivedIn,
      notes,
      referenceNumber
    } = req.body;

    if (paymentDate) payment.paymentDate = new Date(paymentDate);
    if (paymentMode || paymentMethod) {
      payment.paymentMode = paymentMode || paymentMethod;
      payment.paymentMethod = paymentMode || paymentMethod;
    }
    if (paymentReceivedIn) payment.paymentReceivedIn = paymentReceivedIn;
    if (notes !== undefined) payment.notes = notes;
    if (referenceNumber !== undefined) payment.referenceNumber = referenceNumber;

    await payment.save();

    // Update referenced AccountTransaction if any
    const updateFields = {};
    if (payment.paymentDate) updateFields.date = payment.paymentDate;
    if (payment.paymentMode) updateFields.mode = payment.paymentMode;
    if (payment.notes) updateFields.remarks = payment.notes;
    await AccountTransaction.updateMany({ referencePaymentId: payment._id }, { $set: updateFields });

    res.json(payment);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/payments/:id', async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    // Reverse invoices
    if (payment.settledInvoices && payment.settledInvoices.length > 0) {
      for (const item of payment.settledInvoices) {
        if (item.invoiceId) {
          const inv = await Invoice.findById(item.invoiceId);
          if (inv) {
            inv.amountReceived = Math.max(0, (Number(inv.amountReceived) || 0) - (Number(item.amountReceived) || 0));
            if (inv.amountReceived >= inv.amount && inv.amount > 0) {
              inv.status = 'Paid';
            } else if (inv.amountReceived > 0) {
              inv.status = 'Partially Paid';
            } else {
              inv.status = 'Unpaid';
            }
            await inv.save();
          }
        }
      }
    } else if (payment.invoiceId) {
      const inv = await Invoice.findById(payment.invoiceId);
      if (inv) {
        inv.amountReceived = Math.max(0, (Number(inv.amountReceived) || 0) - (Number(payment.amountReceived || payment.amountPaid) || 0));
        if (inv.amountReceived >= inv.amount && inv.amount > 0) {
          inv.status = 'Paid';
        } else if (inv.amountReceived > 0) {
          inv.status = 'Partially Paid';
        } else {
          inv.status = 'Unpaid';
        }
        await inv.save();
      }
    }

    // Remove linked AccountTransaction
    await AccountTransaction.deleteMany({ referencePaymentId: req.params.id });
    await Payment.findByIdAndDelete(req.params.id);
    res.json({ message: 'Payment deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    const { title, category, amount, paymentMethod, paidFromAccount, paidFromAccountId, notes, date } = req.body;
    const count = await Expense.countDocuments();
    const expenseNumber = `EXP-2026-${String(count + 1).padStart(3, '0')}`;

    const isCashPayment = (paymentMethod || '').toLowerCase() === 'cash';

    let targetAccount = null;
    if (isCashPayment) {
      // Find or auto-create dedicated Cash account
      targetAccount = await Account.findOne({ $or: [{ type: 'Cash' }, { name: /cash/i }] });
      if (!targetAccount) {
        targetAccount = new Account({
          name: 'Cash in hand',
          type: 'Cash',
          openingBalance: 0,
          asOfDate: new Date(),
          isDefault: false
        });
        await targetAccount.save();
      }
    } else {
      // Banking-relevant payment method (UPI, Bank Transfer, Cheque, Card, Netbanking)
      if (paidFromAccountId && mongoose.Types.ObjectId.isValid(paidFromAccountId)) {
        targetAccount = await Account.findById(paidFromAccountId);
      } else if (paidFromAccount) {
        targetAccount = await Account.findOne({ name: paidFromAccount });
      }
      // If no valid bank account or was set to cash, select the first bank account
      if (!targetAccount || targetAccount.type === 'Cash') {
        targetAccount = await Account.findOne({ type: { $ne: 'Cash' } }) || await Account.findOne();
      }
    }

    const expAmt = Number(amount) || 0;
    const finalAccountName = targetAccount ? targetAccount.name : (isCashPayment ? 'Cash in hand' : (paidFromAccount || 'Bank'));

    const data = new Expense({
      expenseNumber,
      title: title || '',
      category: category || 'Factory Overhead',
      amount: expAmt,
      paymentMethod: isCashPayment ? 'Cash' : (paymentMethod || 'Bank Transfer'),
      paidFromAccount: finalAccountName,
      paidFromAccountId: targetAccount?._id,
      notes: notes || '',
      date: date ? new Date(date) : new Date()
    });
    await data.save();

    if (targetAccount && expAmt > 0) {
      const tx = new AccountTransaction({
        accountId: targetAccount._id,
        accountName: targetAccount.name,
        date: data.date || new Date(),
        type: 'Expense',
        txnNo: expenseNumber,
        partyName: data.category || 'Direct Expense',
        mode: data.paymentMethod,
        paidAmount: expAmt,
        receivedAmount: 0,
        referenceExpenseId: data._id,
        remarks: data.title || data.notes || ''
      });
      await tx.save();
    }

    res.status(201).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/expenses/:id', async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) return res.status(404).json({ error: 'Expense not found' });

    await AccountTransaction.deleteMany({ referenceExpenseId: req.params.id });
    await Expense.findByIdAndDelete(req.params.id);
    res.json({ message: 'Expense deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== CASH & BANK ACCOUNTS ====================
router.get('/bank-accounts', async (req, res) => {
  try {
    let accounts = await Account.find().sort({ createdAt: 1 });

    // Ensure default Cash account exists
    let cashAccount = accounts.find(a => a.type === 'Cash' || a.name.toLowerCase().includes('cash'));
    if (!cashAccount) {
      cashAccount = await Account.findOne({ $or: [{ type: 'Cash' }, { name: /cash/i }] });
      if (!cashAccount) {
        cashAccount = new Account({
          name: 'Cash in hand',
          type: 'Cash',
          openingBalance: 0,
          asOfDate: new Date(),
          isDefault: false
        });
        await cashAccount.save();
        accounts = await Account.find().sort({ createdAt: 1 });
      }
    }

    if (cashAccount) {
      // Heal any cash transactions erroneously linked to non-cash bank accounts
      await AccountTransaction.updateMany(
        { mode: 'Cash', accountId: { $ne: cashAccount._id } },
        { $set: { accountId: cashAccount._id, accountName: cashAccount.name } }
      );
    }

    // Calculate current balance for each account
    const accountsWithBalances = await Promise.all(accounts.map(async (acc) => {
      const accObj = acc.toObject();

      const txns = await AccountTransaction.find({ accountId: acc._id });
      const referencedPaymentIds = new Set(txns.filter(t => t.referencePaymentId).map(t => String(t.referencePaymentId)));
      const referencedExpenseIds = new Set(txns.filter(t => t.referenceExpenseId).map(t => String(t.referenceExpenseId)));

      const totalTxReceived = txns.reduce((sum, t) => sum + (Number(t.receivedAmount) || 0), 0);
      const totalTxPaid = txns.reduce((sum, t) => sum + (Number(t.paidAmount) || 0), 0);

      // Raw payments (deduplicated against referencedPaymentIds to prevent double counting)
      const isCash = acc.type === 'Cash' || acc.name.toLowerCase().includes('cash');
      const rawPayments = await Payment.find(
        isCash 
          ? { $or: [{ paymentReceivedIn: acc.name }, { paymentMode: 'Cash' }, { paymentMethod: 'Cash' }] }
          : { paymentReceivedIn: acc.name, paymentMode: { $ne: 'Cash' }, paymentMethod: { $ne: 'Cash' } }
      );
      const unlinkedPayments = rawPayments.filter(p => !referencedPaymentIds.has(String(p._id)));
      const totalUnlinkedPaymentsReceived = unlinkedPayments.reduce((sum, p) => sum + (Number(p.amountReceived) || Number(p.amountPaid) || 0), 0);

      // Raw expenses (deduplicated against referencedExpenseIds)
      const rawExpenses = await Expense.find(
        isCash
          ? { $or: [{ paidFromAccount: acc.name }, { paymentMethod: 'Cash' }, { paymentMethod: acc.name }] }
          : { paidFromAccount: acc.name, paymentMethod: { $ne: 'Cash' } }
      );
      const unlinkedExpenses = rawExpenses.filter(e => !referencedExpenseIds.has(String(e._id)));
      const totalUnlinkedExpenses = unlinkedExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

      accObj.currentBalance = (Number(acc.openingBalance) || 0) + totalTxReceived + totalUnlinkedPaymentsReceived - totalTxPaid - totalUnlinkedExpenses;
      return accObj;
    }));

    const totalBalance = accountsWithBalances.reduce((sum, a) => sum + (Number(a.currentBalance) || 0), 0);

    res.json({
      totalBalance,
      accounts: accountsWithBalances
    });
  } catch (err) {
    console.error('Error fetching bank accounts:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/bank-accounts', async (req, res) => {
  try {
    const { accountName, name, type, openingBalance, asOfDate, accountNumber, accountHolderName, ifscCode, bankName, branchName, upiId } = req.body;
    const finalName = (accountName || name || '').trim();
    if (!finalName) return res.status(400).json({ error: 'Account Name is required' });

    const existing = await Account.findOne({ name: finalName });
    if (existing) return res.status(400).json({ error: 'An account with this name already exists' });

    const acc = new Account({
      name: finalName,
      type: type || 'Bank',
      openingBalance: Number(openingBalance) || 0,
      asOfDate: asOfDate ? new Date(asOfDate) : new Date(),
      accountNumber,
      accountHolderName,
      ifscCode,
      bankName,
      branchName,
      upiId
    });
    await acc.save();
    res.status(201).json(acc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/bank-accounts/:id', async (req, res) => {
  try {
    const updated = await Account.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/bank-accounts/:id', async (req, res) => {
  try {
    await Account.findByIdAndDelete(req.params.id);
    await AccountTransaction.deleteMany({ accountId: req.params.id });
    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/bank-accounts/:id/transactions', async (req, res) => {
  try {
    const acc = await Account.findById(req.params.id);
    if (!acc) return res.status(404).json({ error: 'Account not found' });

    const isCash = acc.type === 'Cash' || acc.name.toLowerCase().includes('cash');

    const txns = await AccountTransaction.find({ accountId: acc._id }).sort({ date: 1, createdAt: 1 });
    const referencedPaymentIds = new Set(txns.filter(t => t.referencePaymentId).map(t => String(t.referencePaymentId)));
    const referencedExpenseIds = new Set(txns.filter(t => t.referenceExpenseId).map(t => String(t.referenceExpenseId)));

    const rawPayments = await Payment.find(
      isCash
        ? { $or: [{ paymentReceivedIn: acc.name }, { paymentMode: 'Cash' }, { paymentMethod: 'Cash' }] }
        : { paymentReceivedIn: acc.name, paymentMode: { $ne: 'Cash' }, paymentMethod: { $ne: 'Cash' } }
    ).sort({ paymentDate: 1, createdAt: 1 });
    const unlinkedPayments = rawPayments.filter(p => !referencedPaymentIds.has(String(p._id)));

    const rawExpenses = await Expense.find(
      isCash
        ? { $or: [{ paidFromAccount: acc.name }, { paymentMethod: 'Cash' }, { paymentMethod: acc.name }] }
        : { paidFromAccount: acc.name, paymentMethod: { $ne: 'Cash' } }
    ).sort({ date: 1, createdAt: 1 });
    const unlinkedExpenses = rawExpenses.filter(e => !referencedExpenseIds.has(String(e._id)));

    const allEvents = [];

    // 1. Account Transactions
    txns.forEach(t => {
      allEvents.push({
        _id: t._id,
        date: t.date || t.createdAt,
        type: t.type,
        txnNo: t.txnNo || '—',
        partyName: t.partyName || t.transferToAccountName || 'Account Action',
        mode: t.mode || 'Cash/Bank',
        paid: Number(t.paidAmount) || 0,
        received: Number(t.receivedAmount) || 0,
        notes: t.remarks || '',
        referencePaymentId: t.referencePaymentId,
        referenceExpenseId: t.referenceExpenseId
      });
    });

    // 2. Unlinked Payments
    unlinkedPayments.forEach(p => {
      allEvents.push({
        _id: p._id,
        date: p.paymentDate || p.createdAt,
        type: 'Payment In',
        txnNo: p.paymentNumber || p.receiptNumber || '—',
        partyName: p.partyName || p.customerId?.name || p.invoiceId?.customerName || 'Customer',
        mode: p.paymentMode || p.paymentMethod || 'UPI',
        paid: 0,
        received: Number(p.amountReceived) || Number(p.amountPaid) || 0,
        notes: p.notes || '',
        referencePaymentId: p._id
      });
    });

    // 3. Unlinked Expenses
    unlinkedExpenses.forEach(e => {
      allEvents.push({
        _id: e._id,
        date: e.date || e.createdAt,
        type: 'Expense',
        txnNo: e.expenseNumber || '—',
        partyName: e.category || 'Direct Expense',
        mode: e.paymentMethod || 'Cash',
        paid: Number(e.amount) || 0,
        received: 0,
        notes: e.title || e.notes || '',
        referenceExpenseId: e._id
      });
    });

    // Sort ascending by date to compute running balance starting from opening balance
    allEvents.sort((a, b) => new Date(a.date) - new Date(b.date));

    let running = Number(acc.openingBalance) || 0;
    allEvents.forEach(item => {
      running += (item.received || 0) - (item.paid || 0);
      item.balance = running;
    });

    // Return in reverse chronological order (newest first)
    allEvents.reverse();

    res.json({
      account: acc,
      currentBalance: running,
      transactions: allEvents
    });
  } catch (err) {
    console.error('Error fetching account transactions:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/bank-accounts/adjust', async (req, res) => {
  try {
    const { accountId, action, amount, date, remarks } = req.body;
    const acc = await Account.findById(accountId);
    if (!acc) return res.status(404).json({ error: 'Account not found' });

    const amt = Number(amount) || 0;
    if (amt <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' });

    const isAdd = action === 'add';
    const txnNo = `ADJ-${Date.now().toString().slice(-6)}`;

    const tx = new AccountTransaction({
      accountId: acc._id,
      accountName: acc.name,
      date: date ? new Date(date) : new Date(),
      type: isAdd ? 'Add Money' : 'Reduce Money',
      txnNo,
      partyName: isAdd ? 'Cash/Bank Deposit' : 'Cash/Bank Withdrawal',
      mode: acc.type === 'Cash' ? 'Cash' : 'Bank',
      receivedAmount: isAdd ? amt : 0,
      paidAmount: isAdd ? 0 : amt,
      remarks: remarks || ''
    });
    await tx.save();

    res.status(201).json(tx);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/bank-accounts/transfer', async (req, res) => {
  try {
    const { fromAccountId, toAccountId, amount, date, remarks } = req.body;
    if (fromAccountId === toAccountId) {
      return res.status(400).json({ error: 'Source and destination accounts must be different' });
    }

    const fromAcc = await Account.findById(fromAccountId);
    const toAcc = await Account.findById(toAccountId);
    if (!fromAcc || !toAcc) return res.status(404).json({ error: 'One or both accounts not found' });

    const amt = Number(amount) || 0;
    if (amt <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' });

    const txnNo = `TRF-${Date.now().toString().slice(-6)}`;

    const txOut = new AccountTransaction({
      accountId: fromAcc._id,
      accountName: fromAcc.name,
      date: date ? new Date(date) : new Date(),
      type: 'Transfer Out',
      txnNo,
      partyName: `To: ${toAcc.name}`,
      mode: 'Bank Transfer',
      paidAmount: amt,
      transferToAccountId: toAcc._id,
      transferToAccountName: toAcc.name,
      remarks: remarks || ''
    });
    await txOut.save();

    const txIn = new AccountTransaction({
      accountId: toAcc._id,
      accountName: toAcc.name,
      date: date ? new Date(date) : new Date(),
      type: 'Transfer In',
      txnNo,
      partyName: `From: ${fromAcc.name}`,
      mode: 'Bank Transfer',
      receivedAmount: amt,
      transferToAccountId: fromAcc._id,
      transferToAccountName: fromAcc.name,
      remarks: remarks || ''
    });
    await txIn.save();

    res.status(201).json({ txOut, txIn });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
