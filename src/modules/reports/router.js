import express from 'express';
import mongoose from 'mongoose';
import Order from '../sales/models/Order.js';
import ProductionCard from '../production/models/ProductionCard.js';
import DispatchOrder from '../dispatch/models/DispatchOrder.js';
import Enquiry from '../crm/models/Enquiry.js';
import Invoice from '../accounts/models/Invoice.js';
import Customer from '../crm/models/Customer.js';
import Payment from '../accounts/models/Payment.js';
import Quotation from '../sales/models/Quotation.js';
import User from '../../models/User.js';
import { seedPSeries } from '../../scripts/seedPSeries.js';

const router = express.Router();

router.get('/dashboard-stats', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const enquiriesCount = await Enquiry.countDocuments().catch(() => 0);
    const ordersCount = await Order.countDocuments().catch(() => 0);
    const quotationsCount = await Order.countDocuments({ status: 'Draft' }).catch(() => 0);

    // Production pending: cards not completed
    const productionPendingCount = await ProductionCard.countDocuments({ status: { $ne: 'Completed' } }).catch(() => 0);

    // Dispatch ready/active: dispatch orders not yet delivered
    const readyDispatchCount = await DispatchOrder.countDocuments({ status: { $ne: 'Delivered' } }).catch(() => 0);

    // Compute revenue & receivables from Invoice + Order records
    const invoices = await Invoice.find().catch(() => []);
    const orders = await Order.find().catch(() => []);

    let revenueFromInvoices = invoices.filter(inv => inv.status === 'Paid').reduce((acc, inv) => acc + (inv.amount || 0), 0);
    let pendingFromInvoices = invoices.filter(inv => inv.status !== 'Paid').reduce((acc, inv) => acc + Math.max(0, (inv.amount || 0) - (inv.amountReceived || 0)), 0);

    let revenueFromOrders = orders.reduce((acc, o) => acc + (o.amountPaid || 0), 0);
    let pendingFromOrders = orders.reduce((acc, o) => acc + Math.max(0, (o.amount || o.totalAmount || 0) - (o.amountPaid || 0)), 0);

    const revenue = Math.max(revenueFromInvoices, revenueFromOrders);
    const pendingPayments = Math.max(pendingFromInvoices, pendingFromOrders);

    // Top Customers calculation
    const customerStats = {};
    orders.forEach(o => {
      let cName = '';
      if (typeof o.party === 'object' && o.party !== null) {
        cName = o.party.customerName || o.party.name || o.party.company || '';
      } else if (typeof o.party === 'string') {
        cName = o.party;
      }
      cName = cName || o.customerName || 'Customer Ref';

      if (!customerStats[cName]) {
        customerStats[cName] = { name: cName, orders: 0, revenue: 0 };
      }
      customerStats[cName].orders += 1;
      customerStats[cName].revenue += (o.amount || o.totalAmount || 0);
    });

    const topCustomers = Object.values(customerStats)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 4)
      .map((c, idx) => ({
        name: c.name,
        code: `CUST-${String(idx + 1).padStart(4, '0')}`,
        orders: `${c.orders} Orders`,
        revenue: `₹${c.revenue >= 100000 ? (c.revenue / 100000).toFixed(1) + 'L' : Math.round(c.revenue).toLocaleString('en-IN')}`
      }));

    // Top Products calculation
    const productStats = {};
    orders.forEach(o => {
      if (Array.isArray(o.lineItems) && o.lineItems.length > 0) {
        o.lineItems.forEach(item => {
          const pName = item.templateName || item.name || item.templateCode || 'Window Unit';
          productStats[pName] = (productStats[pName] || 0) + (item.qty || 1);
        });
      }
    });

    const cards = await ProductionCard.find().catch(() => []);
    cards.forEach(c => {
      const pName = c.templateName || c.templateId?.name || 'Standard Twin System';
      productStats[pName] = (productStats[pName] || 0) + (c.qty || 1);
    });

    const topProductsSorted = Object.entries(productStats).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const maxQty = topProductsSorted.length > 0 ? topProductsSorted[0][1] : 1;
    const topProducts = topProductsSorted.map(([pName, qty]) => ({
      name: pName,
      volume: `${qty} units`,
      percentage: Math.min(100, Math.max(15, Math.round((qty / maxQty) * 100)))
    }));

    // Monthly Sales calculation for last 8 months
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthlySalesMap = {};
    const eightMonthsAgo = new Date();
    eightMonthsAgo.setMonth(eightMonthsAgo.getMonth() - 7);
    eightMonthsAgo.setDate(1);

    for (let i = 0; i < 8; i++) {
      const d = new Date(eightMonthsAgo);
      d.setMonth(d.getMonth() + i);
      const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
      monthlySalesMap[key] = { label: monthNames[d.getMonth()], value: 0 };
    }

    orders.forEach(o => {
      const oDate = new Date(o.createdAt || o.date || Date.now());
      const key = `${oDate.getFullYear()}-${oDate.getMonth() + 1}`;
      if (monthlySalesMap[key]) {
        monthlySalesMap[key].value += (o.amount || o.totalAmount || 0);
      }
    });

    const monthlySales = Object.values(monthlySalesMap);

    res.json({
      enquiries: enquiriesCount,
      quotations: quotationsCount,
      orders: ordersCount,
      productionPending: productionPendingCount,
      readyDispatch: readyDispatchCount,
      pendingPayments: pendingPayments,
      revenue: revenue,
      topCustomers: topCustomers,
      topProducts: topProducts,
      monthlySales: monthlySales
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/sales', async (req, res) => {
  try {
    const orders = await Order.find();
    // Group by status
    const statusGroups = orders.reduce((acc, ord) => {
      acc[ord.status] = (acc[ord.status] || 0) + 1;
      return acc;
    }, {});
    
    res.json({
      totalOrders: orders.length,
      statusGroups,
      orders: orders.slice(0, 10) // last 10
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/production', async (req, res) => {
  try {
    const cards = await ProductionCard.find();
    const statusGroups = cards.reduce((acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    }, {});

    // Compute total order worth by looking up linked orders
    let totalOrderWorth = 0;
    const uniqueOrderIds = new Set();
    cards.forEach(c => {
      if (c.orderId) {
        if (typeof c.orderId === 'object' && c.orderId !== null) {
          const amt = c.orderId.totalAmount || c.orderId.amount || 0;
          totalOrderWorth += amt;
        } else {
          const idStr = String(c.orderId);
          if (!uniqueOrderIds.has(idStr)) uniqueOrderIds.add(idStr);
        }
      }
    });

    // Look up any string or ObjectId-based order references
    if (uniqueOrderIds.size > 0) {
      try {
        const idList = Array.from(uniqueOrderIds);
        const validObjectIds = idList.filter(id => mongoose.Types.ObjectId.isValid(id));
        const linkedOrders = await Order.find({
          $or: [
            { id: { $in: idList } },
            { orderNumber: { $in: idList } },
            ...(validObjectIds.length > 0 ? [{ _id: { $in: validObjectIds } }] : [])
          ]
        });
        linkedOrders.forEach(o => {
          totalOrderWorth += (o.amount || o.totalAmount || 0);
        });
      } catch (_) {}
    }

    res.json({
      totalCards: cards.length,
      statusGroups,
      totalOrderWorth,
      cards: cards.slice(0, 10)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/inventory', async (req, res) => {
  try {
    res.json({
      totalStockItems: 0,
      categoryGroups: {},
      lowStock: []
    });
  } catch (err) {
    res.status(550).json({ error: err.message });
  }
});

router.get('/finance', async (req, res) => {
  try {
    const invoices = await Invoice.find();
    const paidRevenue = invoices.filter(i => i.status === 'Paid').reduce((acc, i) => acc + i.amount, 0);
    const unpaidRevenue = invoices.filter(i => i.status !== 'Paid').reduce((acc, i) => acc + i.amount, 0);

    const totalExpenses = 0; // Expenses module removed as requested

    res.json({
      revenuePaid: paidRevenue,
      revenueUnpaid: unpaidRevenue,
      totalExpenses,
      netIncome: paidRevenue - totalExpenses
    });
  } catch (err) {
    console.error("Finance Error:", err.stack);
    res.status(500).json({ error: err.stack });
  }
});

router.get('/customers', async (req, res) => {
  try {
    const { fromDate, toDate, search, status } = req.query;

    const customers = await Customer.find().lean();
    const invoices = await Invoice.find().populate('orderId').lean();
    const payments = await Payment.find().lean();
    const orders = await Order.find().lean();

    // Map of normalized customer name to aggregated customer metrics
    const customerMap = new Map();

    // 1. Initialize with CRM customers
    customers.forEach(c => {
      const key = (c.name || '').trim().toLowerCase();
      if (!key) return;

      customerMap.set(key, {
        id: c._id?.toString(),
        crmCustomerId: c._id?.toString(),
        name: c.name,
        company: c.company || '',
        phone: c.phone || c.mobileNumber || '-',
        mobileNumber: c.mobileNumber || c.phone || '-',
        email: c.email || '',
        billingAddress: c.billingAddress || '',
        openingBalance: Number(c.openingBalance) || 0,
        balanceType: c.balanceType || 'To Collect',
        creditLimit: Number(c.creditLimit) || 0,
        totalCreditAmount: 0,
        totalPaidAmount: 0,
        amountBalance: 0,
        invoices: [],
        payments: [],
        orders: [],
        isCrmCustomer: true
      });
    });

    // 2. Aggregate Invoices
    invoices.forEach(inv => {
      let invDate = inv.createdAt ? new Date(inv.createdAt) : null;
      if (fromDate && invDate && invDate < new Date(fromDate)) return;
      if (toDate && invDate) {
        const toD = new Date(toDate);
        toD.setHours(23, 59, 59, 999);
        if (invDate > toD) return;
      }

      const key = (inv.customerName || '').trim().toLowerCase();
      if (!key) return;

      if (!customerMap.has(key)) {
        customerMap.set(key, {
          id: `ext-${inv._id}`,
          crmCustomerId: null,
          name: inv.customerName,
          company: '',
          phone: '-',
          mobileNumber: '-',
          email: '',
          billingAddress: '',
          openingBalance: 0,
          balanceType: 'To Collect',
          creditLimit: 0,
          totalCreditAmount: 0,
          totalPaidAmount: 0,
          amountBalance: 0,
          invoices: [],
          payments: [],
          orders: [],
          isCrmCustomer: false
        });
      }

      const cust = customerMap.get(key);
      const invAmt = Number(inv.amount) || 0;
      cust.totalCreditAmount += invAmt;
      cust.invoices.push({
        _id: inv._id,
        invoiceNumber: inv.invoiceNumber,
        orderRef: inv.orderRef || (inv.orderId?.id || inv.orderId?.orderNumber || ''),
        amount: invAmt,
        amountReceived: Number(inv.amountReceived) || 0,
        status: inv.status,
        date: inv.createdAt,
        dueDate: inv.dueDate
      });
    });

    // 3. Aggregate Payments
    payments.forEach(p => {
      let pDate = p.paymentDate ? new Date(p.paymentDate) : (p.createdAt ? new Date(p.createdAt) : null);
      if (fromDate && pDate && pDate < new Date(fromDate)) return;
      if (toDate && pDate) {
        const toD = new Date(toDate);
        toD.setHours(23, 59, 59, 999);
        if (pDate > toD) return;
      }

      const key = (p.partyName || '').trim().toLowerCase();
      if (!key) return;

      if (customerMap.has(key)) {
        const cust = customerMap.get(key);
        const pAmt = Number(p.amountReceived != null ? p.amountReceived : p.amountPaid) || 0;
        cust.totalPaidAmount += pAmt;
        cust.payments.push({
          _id: p._id,
          paymentNumber: p.paymentNumber || p.receiptNumber,
          amount: pAmt,
          discount: Number(p.discount) || 0,
          paymentMethod: p.paymentMethod || p.paymentMode || 'Cash',
          paymentReceivedIn: p.paymentReceivedIn || '',
          date: p.paymentDate || p.createdAt,
          notes: p.notes
        });
      }
    });

    // 4. Extract phone/details from Orders if not yet set, and handle orders without invoices
    orders.forEach(o => {
      let oPartyName = '';
      let oPhone = '';
      if (typeof o.party === 'object' && o.party !== null) {
        oPartyName = o.party.customerName || o.party.name || o.party.company || '';
        oPhone = o.party.phone || o.party.mobile || o.party.mobileNumber || '';
      } else if (typeof o.party === 'string') {
        oPartyName = o.party;
      }
      oPartyName = oPartyName || o.customerName || '';
      const key = oPartyName.trim().toLowerCase();
      if (!key) return;

      if (customerMap.has(key)) {
        const cust = customerMap.get(key);
        if ((!cust.phone || cust.phone === '-') && oPhone) {
          cust.phone = oPhone;
          cust.mobileNumber = oPhone;
        }
        // If customer has NO invoices registered, add order total as credit
        if (cust.invoices.length === 0) {
          cust.totalCreditAmount += (Number(o.totalAmount || o.amount) || 0);
          cust.totalPaidAmount += (Number(o.amountPaid) || 0);
        }
        cust.orders.push({
          id: o.id || o.orderNumber,
          orderNumber: o.orderNumber,
          totalAmount: o.totalAmount || o.amount,
          amountPaid: o.amountPaid,
          status: o.status,
          date: o.createdAt
        });
      }
    });

    // 5. Compute balances and finalize status
    let list = Array.from(customerMap.values()).map(c => {
      const openingDebit = c.balanceType === 'To Pay' ? -c.openingBalance : c.openingBalance;
      // Net Amount Balance = Opening Debit + Total Credit Amount - Total Paid Amount
      c.amountBalance = openingDebit + c.totalCreditAmount - c.totalPaidAmount;
      if (c.amountBalance > 0.01) {
        c.status = 'Outstanding';
      } else if (c.amountBalance < -0.01) {
        c.status = 'Advance';
      } else {
        c.status = 'Settled';
      }
      return c;
    });

    // Filter by search term
    if (search) {
      const q = search.trim().toLowerCase();
      list = list.filter(c => 
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.phone && c.phone.toLowerCase().includes(q)) ||
        (c.mobileNumber && c.mobileNumber.toLowerCase().includes(q)) ||
        (c.company && c.company.toLowerCase().includes(q))
      );
    }

    // Filter by status
    if (status && status !== 'all') {
      if (status === 'outstanding') {
        list = list.filter(c => c.amountBalance > 0.01);
      } else if (status === 'settled') {
        list = list.filter(c => Math.abs(c.amountBalance) <= 0.01);
      } else if (status === 'advance') {
        list = list.filter(c => c.amountBalance < -0.01);
      }
    }

    // Default sort by amount balance descending
    list.sort((a, b) => b.amountBalance - a.amountBalance);

    // Compute summary metrics
    const summary = {
      totalCustomers: list.length,
      totalCreditAmount: list.reduce((acc, c) => acc + (c.totalCreditAmount || 0), 0),
      totalPaidAmount: list.reduce((acc, c) => acc + (c.totalPaidAmount || 0), 0),
      totalBalanceAmount: list.reduce((acc, c) => acc + (c.amountBalance > 0 ? c.amountBalance : 0), 0),
      outstandingCount: list.filter(c => c.amountBalance > 0.01).length,
      settledCount: list.filter(c => Math.abs(c.amountBalance) <= 0.01).length,
      advanceCount: list.filter(c => c.amountBalance < -0.01).length
    };

    res.json({
      summary,
      customers: list
    });
  } catch (err) {
    console.error('Customer Report Error:', err.stack);
    res.status(500).json({ error: err.message });
  }
});

// ================= SERIES REPORT =================
router.get('/series', async (req, res) => {
  try {
    const {
      series = 'All',
      search = '',
      fromDate = '',
      toDate = '',
      employee = '',
      sortBy = 'sequence',
      sortOrder = 'asc'
    } = req.query;

    // Check if we need to auto-seed P-series
    const pOrdersCount = await Order.countDocuments({ series: 'P' });
    if (pOrdersCount === 0) {
      await seedPSeries().catch(err => console.warn('Auto-seed P-Series warning:', err.message));
    }

    const orders = await Order.find().lean();
    const quotations = await Quotation.find().lean();
    const productionCards = await ProductionCard.find().lean();
    const users = await User.find({}, 'name username role').lean();

    // Fast lookup maps
    const quoteByNumber = new Map();
    const quoteByOrderRef = new Map();
    quotations.forEach(q => {
      if (q.quotationNumber) quoteByNumber.set(String(q.quotationNumber).trim().toUpperCase(), q);
      if (q.orderRef) quoteByOrderRef.set(String(q.orderRef).trim().toUpperCase(), q);
    });

    const cardByOrderId = new Map();
    const cardByCardNo = new Map();
    productionCards.forEach(c => {
      if (c.orderId) {
        const oIdStr = typeof c.orderId === 'object' && c.orderId !== null ? (c.orderId._id || c.orderId.id) : String(c.orderId);
        if (oIdStr) cardByOrderId.set(String(oIdStr), c);
      }
      if (c.productionCardNo) {
        cardByCardNo.set(String(c.productionCardNo).trim().toUpperCase(), c);
      }
    });

    // Helper to extract series letter & sequence number from a code (e.g. "P136", "Set 1 - A001", "P-136")
    const parseSeriesAndSeq = (str, fallbackSeries = 'A', fallbackSeq = 1) => {
      if (!str || typeof str !== 'string') return { series: fallbackSeries, seq: fallbackSeq };
      const trimmed = str.trim();
      const match = trimmed.match(/(?:Set\s*\d+\s*[-:]\s*)?([A-Za-z]+)\s*[-_]?\s*(\d+)/i);
      if (match) {
        return {
          series: match[1].toUpperCase(),
          seq: parseInt(match[2], 10) || fallbackSeq
        };
      }
      return { series: fallbackSeries, seq: fallbackSeq };
    };

    // Helper to format Date to DD-MM-YYYY string & ISO date
    const formatDateDisplay = (d) => {
      if (!d) return '—';
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return typeof d === 'string' ? d : '—';
      const day = String(dt.getDate()).padStart(2, '0');
      const month = String(dt.getMonth() + 1).padStart(2, '0');
      const year = dt.getFullYear();
      return `${day}-${month}-${year}`;
    };

    const rows = [];
    const processedOrderIds = new Set();
    const processedQuoteNumbers = new Set();
    const processedCardNos = new Set();

    // 1. Process from Orders
    for (const ord of orders) {
      processedOrderIds.add(String(ord._id));
      if (ord.id) processedOrderIds.add(String(ord.id));

      // Resolve Quotation
      let linkedQuote = null;
      if (ord.quotationRef) {
        const qKey = String(ord.quotationRef).trim().toUpperCase();
        linkedQuote = quoteByNumber.get(qKey) || null;
      }
      if (!linkedQuote && ord.id) {
        linkedQuote = quoteByOrderRef.get(String(ord.id).trim().toUpperCase()) || null;
      }
      if (!linkedQuote && ord.orderNumber) {
        linkedQuote = quoteByOrderRef.get(String(ord.orderNumber).trim().toUpperCase()) || null;
      }
      if (linkedQuote?.quotationNumber) {
        processedQuoteNumbers.add(String(linkedQuote.quotationNumber).trim().toUpperCase());
      }

      // Resolve Production Card
      let linkedCard = cardByOrderId.get(String(ord._id)) || (ord.id ? cardByOrderId.get(String(ord.id)) : null);
      if (!linkedCard && ord.orderNumber) {
        linkedCard = cardByCardNo.get(String(ord.orderNumber).trim().toUpperCase()) || null;
      }
      if (!linkedCard && ord.productionCardNo) {
        linkedCard = cardByCardNo.get(String(ord.productionCardNo).trim().toUpperCase()) || null;
      }
      if (linkedCard?.productionCardNo) {
        processedCardNos.add(String(linkedCard.productionCardNo).trim().toUpperCase());
      }

      // Extract Series & Sequence Number
      let s = ord.series ? ord.series.toUpperCase() : null;
      let seq = ord.sequenceNumber || null;
      if (!s || !seq) {
        const parsed = parseSeriesAndSeq(ord.productionCardNo || ord.orderNumber || ord.id, 'A', 1);
        if (!s) s = parsed.series;
        if (!seq) seq = parsed.seq;
      }

      const prodCardNo = ord.productionCardNo || linkedCard?.productionCardNo || ord.orderNumber || (s && seq ? `${s}${seq}` : ord.id);
      if (prodCardNo) processedCardNos.add(String(prodCardNo).trim().toUpperCase());

      // Quotation Number
      const quoteNo = linkedQuote?.quotationNumber || ord.quotationRef || '—';
      if (quoteNo !== '—') processedQuoteNumbers.add(String(quoteNo).trim().toUpperCase());

      // Date of Quotation
      const rawDate = linkedQuote?.date || ord.quotationDate || ord.date || ord.createdAt;
      const displayDate = formatDateDisplay(rawDate);

      // Customer Name
      let customerName = '';
      if (typeof ord.party === 'object' && ord.party !== null) {
        customerName = ord.party.customerName || ord.party.name || ord.party.company || '';
      } else if (typeof ord.party === 'string') {
        customerName = ord.party;
      }
      customerName = customerName || ord.customerName || linkedCard?.customerName || linkedQuote?.party?.name || '—';

      // Amount
      const amount = Number(ord.totalAmount || ord.amount || linkedQuote?.totalAmount || 0) || 0;

      // Employee who follows
      const emp = (ord.employee || ord.followedBy || linkedCard?.employee || linkedCard?.followedBy || linkedQuote?.employee || linkedQuote?.followedBy || '').trim();

      rows.push({
        _id: ord._id,
        orderId: ord.id || String(ord._id),
        quotationId: linkedQuote?._id || null,
        cardId: linkedCard?._id || null,
        quotationDate: rawDate,
        dateDisplay: displayDate,
        quotationNumber: quoteNo,
        productionCardNo: prodCardNo,
        series: s,
        sequenceNumber: seq,
        customerName: customerName,
        amount: amount,
        employee: emp,
        status: ord.status || linkedCard?.status || 'Active',
        sourceType: 'Order'
      });
    }

    // 2. Process standalone Quotations not mapped to an order
    for (const q of quotations) {
      const qNumKey = String(q.quotationNumber || '').trim().toUpperCase();
      if (qNumKey && processedQuoteNumbers.has(qNumKey)) continue;

      const parsed = parseSeriesAndSeq(q.orderRef, 'P', 1);
      const prodCardNo = q.orderRef || '—';
      const rawDate = q.date || q.createdAt;
      const displayDate = formatDateDisplay(rawDate);

      let customerName = '';
      if (typeof q.party === 'object' && q.party !== null) {
        customerName = q.party.customerName || q.party.name || q.party.company || '';
      } else if (typeof q.party === 'string') {
        customerName = q.party;
      }
      customerName = customerName || '—';

      const emp = (q.employee || q.followedBy || '').trim();

      rows.push({
        _id: q._id,
        orderId: null,
        quotationId: q._id,
        cardId: null,
        quotationDate: rawDate,
        dateDisplay: displayDate,
        quotationNumber: q.quotationNumber || '—',
        productionCardNo: prodCardNo,
        series: parsed.series,
        sequenceNumber: parsed.seq,
        customerName: customerName,
        amount: Number(q.totalAmount || q.amount || 0) || 0,
        employee: emp,
        status: q.status || 'Pending',
        sourceType: 'Quotation'
      });
    }

    // Collect all available series letters & employee suggestions
    const seriesSet = new Set();
    const seriesCounts = { All: rows.length };
    const empSet = new Set(['DHANAPRAKASH', 'JANARTHARAJA']);

    users.forEach(u => {
      if (u.name) empSet.add(u.name.trim());
    });

    rows.forEach(r => {
      if (r.series) {
        seriesSet.add(r.series);
        seriesCounts[r.series] = (seriesCounts[r.series] || 0) + 1;
      }
      if (r.employee) empSet.add(r.employee);
    });

    // Make sure standard tabs like 'A', 'B', 'P' are visible in availableSeries
    ['A', 'B', 'P'].forEach(s => seriesSet.add(s));
    const availableSeries = Array.from(seriesSet).sort();

    // Filter by Series
    let filtered = [...rows];
    if (series && series !== 'All') {
      const targetSeries = series.toUpperCase();
      filtered = filtered.filter(r => r.series === targetSeries);
    }

    // Filter by Search Query
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(r =>
        (r.quotationNumber && r.quotationNumber.toLowerCase().includes(q)) ||
        (r.productionCardNo && r.productionCardNo.toLowerCase().includes(q)) ||
        (r.customerName && r.customerName.toLowerCase().includes(q)) ||
        (r.employee && r.employee.toLowerCase().includes(q)) ||
        (r.dateDisplay && r.dateDisplay.toLowerCase().includes(q))
      );
    }

    // Filter by Date Range
    if (fromDate) {
      const fDate = new Date(fromDate);
      filtered = filtered.filter(r => r.quotationDate && new Date(r.quotationDate) >= fDate);
    }
    if (toDate) {
      const tDate = new Date(toDate);
      tDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(r => r.quotationDate && new Date(r.quotationDate) <= tDate);
    }

    // Filter by Employee
    if (employee && employee !== 'All') {
      const eTarget = employee.trim().toLowerCase();
      filtered = filtered.filter(r => r.employee && r.employee.toLowerCase() === eTarget);
    }

    // Sorting
    filtered.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'sequence' || sortBy === 'productionCardNo') {
        const seqA = a.sequenceNumber || 0;
        const seqB = b.sequenceNumber || 0;
        comparison = seqA - seqB;
      } else if (sortBy === 'date') {
        const dateA = a.quotationDate ? new Date(a.quotationDate).getTime() : 0;
        const dateB = b.quotationDate ? new Date(b.quotationDate).getTime() : 0;
        comparison = dateA - dateB;
      } else if (sortBy === 'customer') {
        comparison = (a.customerName || '').localeCompare(b.customerName || '');
      } else if (sortBy === 'amount') {
        comparison = (a.amount || 0) - (b.amount || 0);
      } else if (sortBy === 'employee') {
        comparison = (a.employee || '').localeCompare(b.employee || '');
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    const summary = {
      totalEntries: filtered.length,
      totalAmount: filtered.reduce((sum, r) => sum + (r.amount || 0), 0),
      seriesCounts,
      uniqueEmployeesCount: new Set(filtered.map(r => r.employee).filter(Boolean)).size
    };

    res.json({
      success: true,
      summary,
      availableSeries,
      employees: Array.from(empSet).filter(Boolean).sort(),
      entries: filtered
    });
  } catch (err) {
    console.error('Series Report Error:', err.stack);
    res.status(500).json({ error: err.message });
  }
});

// Update employee who follows
router.put('/series/:id/employee', async (req, res) => {
  try {
    const { id } = req.params;
    const { employee } = req.body;
    const empValue = String(employee || '').trim();

    // 1. Try finding Order by _id or id or orderNumber
    let order = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      order = await Order.findById(id);
    }
    if (!order) {
      order = await Order.findOne({ $or: [{ id }, { orderNumber: id }, { productionCardNo: id }] });
    }

    if (order) {
      order.employee = empValue;
      order.followedBy = empValue;
      await order.save();

      // Also update linked Quotation if any
      if (order.quotationRef) {
        await Quotation.updateMany(
          { $or: [{ quotationNumber: order.quotationRef }, { orderRef: order.orderNumber }, { orderRef: order.id }] },
          { $set: { employee: empValue, followedBy: empValue } }
        );
      }

      // Also update linked ProductionCard if any
      await ProductionCard.updateMany(
        { $or: [{ orderId: order._id }, { orderId: order.id }, { productionCardNo: order.productionCardNo }] },
        { $set: { employee: empValue, followedBy: empValue } }
      );

      return res.json({ success: true, message: 'Employee updated successfully', employee: empValue });
    }

    // 2. Try Quotation
    let quote = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      quote = await Quotation.findById(id);
    }
    if (!quote) {
      quote = await Quotation.findOne({ quotationNumber: id });
    }
    if (quote) {
      quote.employee = empValue;
      quote.followedBy = empValue;
      await quote.save();
      return res.json({ success: true, message: 'Employee updated on Quotation', employee: empValue });
    }

    // 3. Try ProductionCard
    let card = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      card = await ProductionCard.findById(id);
    }
    if (card) {
      card.employee = empValue;
      card.followedBy = empValue;
      await card.save();
      return res.json({ success: true, message: 'Employee updated on Production Card', employee: empValue });
    }

    res.status(404).json({ error: 'Record not found to update employee' });
  } catch (err) {
    console.error('Update employee error:', err.stack);
    res.status(500).json({ error: err.message });
  }
});

// Add new series record directly
router.post('/series', async (req, res) => {
  try {
    const {
      quotationDate,
      quotationNumber,
      productionCardNo,
      customerName,
      amount,
      employee
    } = req.body;

    if (!productionCardNo) {
      return res.status(400).json({ error: 'Production Card No is required' });
    }

    const pCardNo = String(productionCardNo).trim().toUpperCase();
    const custName = String(customerName || 'Customer Ref').trim();
    const qNum = String(quotationNumber || `#${Date.now().toString().slice(-6)}`).trim();
    const emp = String(employee || '').trim();
    const amt = Number(amount) || 0;
    const dateObj = quotationDate ? new Date(quotationDate) : new Date();

    const match = pCardNo.match(/^([A-Za-z]+)(\d+)$/);
    const series = match ? match[1].toUpperCase() : 'P';
    const sequenceNumber = match ? parseInt(match[2], 10) : 1;
    const formattedOrderId = `Set 1 - ${pCardNo}`;

    // Ensure Customer
    let customer = await Customer.findOne({ name: custName });
    if (!customer) {
      customer = await Customer.create({
        name: custName,
        phone: '—',
        status: 'Active'
      });
    }

    // Ensure Quotation
    let quotation = await Quotation.findOne({ quotationNumber: qNum });
    if (!quotation) {
      quotation = await Quotation.create({
        quotationNumber: qNum,
        date: dateObj,
        party: { name: custName },
        totalAmount: amt,
        subtotal: amt,
        status: 'Converted',
        orderRef: pCardNo,
        employee: emp,
        followedBy: emp
      });
    }

    // Create Order
    let order = await Order.findOne({
      $or: [{ id: formattedOrderId }, { orderNumber: pCardNo }]
    });
    if (!order) {
      order = await Order.create({
        id: formattedOrderId,
        orderNumber: pCardNo,
        productionCardNo: pCardNo,
        setNumber: 1,
        setLabel: 'Set 1',
        series,
        sequenceNumber,
        quotationRef: qNum,
        quotationDate: dateObj,
        date: dateObj.toISOString().split('T')[0],
        party: { name: custName },
        customerName: custName,
        amount: amt,
        totalAmount: amt,
        amountPaid: amt,
        paymentStatus: 'Paid',
        status: 'In Production',
        employee: emp,
        followedBy: emp
      });
    }

    // Create ProductionCard
    let card = await ProductionCard.findOne({ productionCardNo: pCardNo });
    if (!card) {
      card = await ProductionCard.create({
        orderId: order._id,
        productionCardNo: pCardNo,
        templateId: `${series}-SERIES-TEMPLATE`,
        customerName: custName,
        projectName: formattedOrderId,
        templateName: 'Standard System',
        productionDate: dateObj,
        status: 'In Production',
        qty: 1,
        employee: emp,
        followedBy: emp
      });
    }

    res.status(201).json({
      success: true,
      message: 'Series entry created successfully',
      entry: {
        _id: order._id,
        productionCardNo: pCardNo,
        quotationNumber: qNum,
        customerName: custName,
        amount: amt,
        employee: emp,
        series,
        sequenceNumber,
        dateDisplay: dateObj.toISOString().split('T')[0]
      }
    });
  } catch (err) {
    console.error('Create series entry error:', err.stack);
    res.status(500).json({ error: err.message });
  }
});

// Trigger seed P-series on demand
router.post('/series/seed', async (req, res) => {
  try {
    await seedPSeries();
    res.json({ success: true, message: 'P-Series seeded successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
