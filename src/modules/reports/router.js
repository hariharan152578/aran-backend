import express from 'express';
import Order from '../sales/models/Order.js';
import ProductionCard from '../production/models/ProductionCard.js';
import DispatchOrder from '../dispatch/models/DispatchOrder.js';
import Enquiry from '../crm/models/Enquiry.js';
import Invoice from '../accounts/models/Invoice.js';
import Customer from '../crm/models/Customer.js';
import Payment from '../accounts/models/Payment.js';

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

export default router;
