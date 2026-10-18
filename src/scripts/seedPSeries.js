import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from '../modules/sales/models/Order.js';
import Quotation from '../modules/sales/models/Quotation.js';
import ProductionCard from '../modules/production/models/ProductionCard.js';
import Customer from '../modules/crm/models/Customer.js';

dotenv.config();

export const P_SERIES_DATA = [
  {
    quotationDate: '2026-06-19',
    quotationNumber: '#62026-133',
    productionCardNo: 'P136',
    series: 'P',
    sequenceNumber: 136,
    customerName: 'NALANDAS SCHOOL',
    amount: 12000,
    employee: 'DHANAPRAKASH'
  },
  {
    quotationDate: '2026-06-22',
    quotationNumber: '#62026-189',
    productionCardNo: 'P137',
    series: 'P',
    sequenceNumber: 137,
    customerName: 'BOOPATHI VITTAMPALAYAM',
    amount: 6000,
    employee: 'DHANAPRAKASH'
  },
  {
    quotationDate: '2026-06-22',
    quotationNumber: '#62026-198',
    productionCardNo: 'P138',
    series: 'P',
    sequenceNumber: 138,
    customerName: 'VELMURUGAN ANANGUR',
    amount: 2600,
    employee: 'DHANAPRAKASH'
  },
  {
    quotationDate: '2026-06-23',
    quotationNumber: '#62026-37',
    productionCardNo: 'P139',
    series: 'P',
    sequenceNumber: 139,
    customerName: 'KANDHASAMY DVK',
    amount: 6500,
    employee: 'DHANAPRAKASH'
  },
  {
    quotationDate: '2026-02-13',
    quotationNumber: '#022026-89',
    productionCardNo: 'P140',
    series: 'P',
    sequenceNumber: 140,
    customerName: 'THANGAM HOSPITAL',
    amount: 447898,
    employee: 'DHANAPRAKASH'
  },
  {
    quotationDate: '2026-05-07',
    quotationNumber: '#052026-35',
    productionCardNo: 'P141',
    series: 'P',
    sequenceNumber: 141,
    customerName: 'THANGAM HOSPITAL',
    amount: 167402,
    employee: 'DHANAPRAKASH'
  },
  {
    quotationDate: '2026-08-08',
    quotationNumber: '#082026-52',
    productionCardNo: 'P142',
    series: 'P',
    sequenceNumber: 142,
    customerName: 'ARUN KUMAR DVK',
    amount: 3000,
    employee: 'JANARTHARAJA'
  },
  {
    quotationDate: '2026-08-25',
    quotationNumber: '#082026-163',
    productionCardNo: 'P143',
    series: 'P',
    sequenceNumber: 143,
    customerName: 'PALANISAMY MESTHIRI',
    amount: 9600,
    employee: 'DHANAPRAKASH'
  },
  {
    quotationDate: '2026-08-25',
    quotationNumber: '#082026-113',
    productionCardNo: 'P144',
    series: 'P',
    sequenceNumber: 144,
    customerName: 'SENTHIL',
    amount: 10530,
    employee: 'DHANAPRAKASH'
  },
  {
    quotationDate: '2026-08-25',
    quotationNumber: '#082026-132',
    productionCardNo: 'P145',
    series: 'P',
    sequenceNumber: 145,
    customerName: 'RAGHUPATHY',
    amount: 18545,
    employee: 'DHANAPRAKASH'
  },
  {
    quotationDate: '2026-08-25',
    quotationNumber: '#082026-43',
    productionCardNo: 'P146',
    series: 'P',
    sequenceNumber: 146,
    customerName: 'KIRUJAKARAN',
    amount: 339797,
    employee: 'DHANAPRAKASH'
  },
  {
    quotationDate: '2026-09-05',
    quotationNumber: '#92026-27',
    productionCardNo: 'P147',
    series: 'P',
    sequenceNumber: 147,
    customerName: 'DIVAKAR KILERIPATTI',
    amount: 40639,
    employee: 'DHANAPRAKASH'
  },
  {
    quotationDate: '2026-09-19',
    quotationNumber: '#92026-63',
    productionCardNo: 'P148',
    series: 'P',
    sequenceNumber: 148,
    customerName: 'SENTHIL ANNA',
    amount: 125842,
    employee: 'DHANAPRAKASH'
  },
  {
    quotationDate: '2026-09-25',
    quotationNumber: '#92026-204',
    productionCardNo: 'P149',
    series: 'P',
    sequenceNumber: 149,
    customerName: 'MAHESHWARI KEELERIPATTI',
    amount: 2700,
    employee: 'DHANAPRAKASH'
  },
  {
    quotationDate: '2026-09-25',
    quotationNumber: '#82026-182',
    productionCardNo: 'P150',
    series: 'P',
    sequenceNumber: 150,
    customerName: 'NITHIYA COTTON',
    amount: 35150,
    employee: 'DHANAPRAKASH'
  },
  {
    quotationDate: '2026-09-25',
    quotationNumber: '#92026-155',
    productionCardNo: 'P151',
    series: 'P',
    sequenceNumber: 151,
    customerName: 'MR.HARI',
    amount: 72940,
    employee: 'DHANAPRAKASH'
  },
  {
    quotationDate: '2026-10-05',
    quotationNumber: '#92026-68',
    productionCardNo: 'P152',
    series: 'P',
    sequenceNumber: 152,
    customerName: 'MR.ASS BROILERS',
    amount: 18117,
    employee: 'DHANAPRAKASH'
  },
  {
    quotationDate: '2026-10-15',
    quotationNumber: '#92026-155',
    productionCardNo: 'P153',
    series: 'P',
    sequenceNumber: 153,
    customerName: 'MR.HARI',
    amount: 80473,
    employee: 'DHANAPRAKASH'
  },
  {
    quotationDate: '2026-10-15',
    quotationNumber: '#92026-61',
    productionCardNo: 'P154',
    series: 'P',
    sequenceNumber: 154,
    customerName: 'MR.DHIVAGAR',
    amount: 328427,
    employee: 'DHANAPRAKASH'
  },
  {
    quotationDate: '2026-10-16',
    quotationNumber: '#102026-118',
    productionCardNo: 'P155',
    series: 'P',
    sequenceNumber: 155,
    customerName: 'KARTHIKA POONGANAGAR',
    amount: 3300,
    employee: 'DHANAPRAKASH'
  },
  {
    quotationDate: '2026-10-16',
    quotationNumber: '#92026-67',
    productionCardNo: 'P156',
    series: 'P',
    sequenceNumber: 156,
    customerName: 'PAVITHRA ETTIMADAI',
    amount: 208476,
    employee: 'DHANAPRAKASH'
  }
];

export async function seedPSeries() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/aran_erp';
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
  }

  console.log('Seeding P-Series records...');

  for (const item of P_SERIES_DATA) {
    const formattedOrderId = `Set 1 - ${item.productionCardNo}`;
    const dateObj = new Date(item.quotationDate);

    // 1. Ensure or update Customer
    let customer = await Customer.findOne({ name: item.customerName });
    if (!customer) {
      customer = await Customer.create({
        name: item.customerName,
        phone: '9876543210',
        mobileNumber: '9876543210',
        status: 'Active'
      });
    }

    // 2. Ensure or update Quotation
    let quotation = await Quotation.findOne({ quotationNumber: item.quotationNumber });
    if (!quotation) {
      quotation = await Quotation.create({
        quotationNumber: item.quotationNumber,
        date: dateObj,
        party: { name: item.customerName },
        totalAmount: item.amount,
        subtotal: item.amount,
        status: 'Converted',
        orderRef: item.productionCardNo,
        employee: item.employee,
        followedBy: item.employee
      });
    } else {
      quotation.employee = item.employee;
      quotation.followedBy = item.employee;
      quotation.orderRef = item.productionCardNo;
      await quotation.save();
    }

    // 3. Ensure or update Order
    let order = await Order.findOne({
      $or: [
        { id: formattedOrderId },
        { orderNumber: item.productionCardNo }
      ]
    });

    if (!order) {
      order = await Order.create({
        id: formattedOrderId,
        orderNumber: item.productionCardNo,
        productionCardNo: item.productionCardNo,
        setNumber: 1,
        setLabel: 'Set 1',
        series: item.series,
        sequenceNumber: item.sequenceNumber,
        quotationRef: item.quotationNumber,
        quotationDate: dateObj,
        date: item.quotationDate,
        party: { name: item.customerName },
        customerName: item.customerName,
        amount: item.amount,
        totalAmount: item.amount,
        amountPaid: item.amount,
        paymentStatus: 'Paid',
        status: 'In Production',
        employee: item.employee,
        followedBy: item.employee
      });
    } else {
      order.employee = item.employee;
      order.followedBy = item.employee;
      order.productionCardNo = item.productionCardNo;
      order.quotationRef = item.quotationNumber;
      order.quotationDate = dateObj;
      await order.save();
    }

    // 4. Ensure or update ProductionCard
    let card = await ProductionCard.findOne({
      $or: [
        { orderId: order._id },
        { orderId: formattedOrderId },
        { orderId: item.productionCardNo },
        { productionCardNo: item.productionCardNo }
      ]
    });

    if (!card) {
      card = await ProductionCard.create({
        orderId: order._id,
        productionCardNo: item.productionCardNo,
        templateId: 'P-SERIES-TEMPLATE',
        customerName: item.customerName,
        projectName: formattedOrderId,
        templateName: 'Standard Twin System',
        productionDate: dateObj,
        status: 'In Production',
        qty: 1,
        priority: 'Normal',
        employee: item.employee,
        followedBy: item.employee
      });
    } else {
      card.productionCardNo = item.productionCardNo;
      card.employee = item.employee;
      card.followedBy = item.employee;
      await card.save();
    }
  }

  console.log(`Successfully synced ${P_SERIES_DATA.length} P-Series records!`);
}

// Direct execution
if (process.argv[1]?.includes('seedPSeries.js')) {
  seedPSeries()
    .then(() => {
      console.log('Done!');
      process.exit(0);
    })
    .catch(err => {
      console.error('Error seeding P-Series:', err);
      process.exit(1);
    });
}
