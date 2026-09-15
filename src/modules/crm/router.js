import express from 'express';
import Customer from './models/Customer.js';
import Enquiry from './models/Enquiry.js';
import Followup from './models/Followup.js';
import PartyCategory from './models/PartyCategory.js';

const router = express.Router();

// CATEGORIES ROUTES
router.get('/categories', async (req, res) => {
  try {
    const categories = await PartyCategory.find().sort({ name: 1 });
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/categories', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Category name is required' });
    const exists = await PartyCategory.findOne({ name: name.trim() });
    if (exists) return res.status(400).json({ error: 'Category already exists' });
    const category = new PartyCategory({ name: name.trim() });
    await category.save();
    res.status(201).json(category);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Seed initial parties with full details if database is empty
const ensureCustomers = async () => {
  const count = await Customer.countDocuments();
  if (count === 0) {
    const defaultParties = [
      {
        name: 'Apex Architectural Systems Pvt Ltd',
        company: 'Apex Architectural Systems',
        contactPersonName: 'Rajesh Sharma',
        phone: '+91 98401 23456',
        email: 'rajesh@apexarch.in',
        gstin: '33AAACA1234A1Z5',
        panNumber: 'AAACA1234A',
        partyType: 'Customer',
        partyCategory: 'Architect / Fabricator',
        billingAddress: 'Plot No 42, Industrial Estate, Guindy, Chennai, Tamil Nadu - 600032',
        shippingAddress: 'Site #12, OMR IT Highway, Perungudi, Chennai, Tamil Nadu - 600096',
        creditPeriod: 30,
        creditLimit: 500000,
        openingBalance: 0,
        balanceType: 'To Collect',
        status: 'Active'
      },
      {
        name: 'Breeze Windows & Glazing Solutions',
        company: 'Breeze Glazing',
        contactPersonName: 'Vikram Anand',
        phone: '+91 97902 34567',
        email: 'info@breezewindows.com',
        gstin: '33AABCB5678B1Z2',
        panNumber: 'AABCB5678B',
        partyType: 'Customer',
        partyCategory: 'Builder / Contractor',
        billingAddress: 'No 18, Mount Road, Thousand Lights, Chennai, Tamil Nadu - 600006',
        shippingAddress: 'No 18, Mount Road, Thousand Lights, Chennai, Tamil Nadu - 600006',
        creditPeriod: 45,
        creditLimit: 1000000,
        openingBalance: 25000,
        balanceType: 'To Collect',
        status: 'Active'
      },
      {
        name: 'Skyline Infra & Housing Ltd',
        company: 'Skyline Infra Ltd',
        contactPersonName: 'Suresh Menon',
        phone: '+91 94440 98765',
        email: 'suresh.m@skylineinfra.co.in',
        gstin: '33AACCS9876C1Z9',
        panNumber: 'AACCS9876C',
        partyType: 'Customer',
        partyCategory: 'Builder / Developer',
        billingAddress: '5th Floor, Skyline Towers, Anna Salai, Chennai, Tamil Nadu - 600002',
        shippingAddress: 'Skyline Park View Phase-2, ECR Road, Chennai, Tamil Nadu - 600119',
        creditPeriod: 60,
        creditLimit: 2500000,
        openingBalance: 0,
        balanceType: 'To Collect',
        status: 'Active'
      },
      {
        name: 'Metro Aluminum Extrusions & Hardware',
        company: 'Metro Aluminum',
        contactPersonName: 'Amit Kumar',
        phone: '+91 98841 11223',
        email: 'sales@metroextrusions.com',
        gstin: '33AADCM4321D1Z1',
        panNumber: 'AADCM4321D',
        partyType: 'Vendor',
        partyCategory: 'Supplier',
        billingAddress: 'Shed 8B, SIDCO Industrial Estate, Ambattur, Chennai, Tamil Nadu - 600058',
        shippingAddress: 'Shed 8B, SIDCO Industrial Estate, Ambattur, Chennai, Tamil Nadu - 600058',
        creditPeriod: 30,
        creditLimit: 750000,
        openingBalance: 0,
        balanceType: 'To Pay',
        status: 'Active'
      },
      {
        name: 'Priya Decorators & Interiors',
        company: 'Priya Interiors',
        contactPersonName: 'Priya Sundaram',
        phone: '+91 91766 54321',
        email: 'priya@priyadecor.in',
        gstin: '33AAECP8765E1Z4',
        panNumber: 'AAECP8765E',
        partyType: 'Customer',
        partyCategory: 'Interior Designer',
        billingAddress: '24/A, 2nd Avenue, Anna Nagar, Chennai, Tamil Nadu - 600040',
        shippingAddress: 'Villa 7, Emerald Enclave, Mogappair West, Chennai, Tamil Nadu - 600037',
        creditPeriod: 15,
        creditLimit: 300000,
        openingBalance: 0,
        balanceType: 'To Collect',
        status: 'Active'
      }
    ];

    await Customer.insertMany(defaultParties);
  }
};

// CUSTOMERS
router.get('/customers', async (req, res) => {
  try {
    await ensureCustomers();
    const data = await Customer.find().sort({ name: 1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/customers', async (req, res) => {
  try {
    const data = new Customer(req.body);
    await data.save();
    res.status(201).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/customers/:id', async (req, res) => {
  try {
    const data = await Customer.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/customers/:id', async (req, res) => {
  try {
    await Customer.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ENQUIRIES
router.get('/enquiries', async (req, res) => {
  try {
    const data = await Enquiry.find().sort({ createdAt: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/enquiries', async (req, res) => {
  try {
    const data = new Enquiry(req.body);
    await data.save();
    res.status(201).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/enquiries/:id', async (req, res) => {
  try {
    const data = await Enquiry.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/enquiries/:id', async (req, res) => {
  try {
    await Enquiry.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// FOLLOWUPS
router.get('/followups', async (req, res) => {
  try {
    const data = await Followup.find().sort({ date: 1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/followups', async (req, res) => {
  try {
    const data = new Followup(req.body);
    await data.save();
    res.status(201).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/followups/:id', async (req, res) => {
  try {
    const data = await Followup.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/followups/:id', async (req, res) => {
  try {
    await Followup.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
