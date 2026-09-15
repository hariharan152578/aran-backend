import express from 'express';
import WarrantyCard from './models/WarrantyCard.js';
import Complaint from './models/Complaint.js';
import AMC from './models/AMC.js';

const router = express.Router();

// WARRANTY CARDS
router.get('/warranty', async (req, res) => {
  try {
    const data = await WarrantyCard.find().populate('orderId').sort({ createdAt: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/warranty', async (req, res) => {
  try {
    const count = await WarrantyCard.countDocuments();
    const warrantyNumber = `WARN-2026-${String(count + 1).padStart(3, '0')}`;
    const data = new WarrantyCard({ ...req.body, warrantyNumber });
    await data.save();
    res.status(201).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// COMPLAINTS
router.get('/complaints', async (req, res) => {
  try {
    const data = await Complaint.find().populate('orderId').sort({ createdAt: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/complaints', async (req, res) => {
  try {
    const count = await Complaint.countDocuments();
    const complaintNumber = `COMP-2026-${String(count + 1).padStart(3, '0')}`;
    const data = new Complaint({ ...req.body, complaintNumber });
    await data.save();
    res.status(201).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/complaints/:id', async (req, res) => {
  try {
    const data = await Complaint.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// AMC
router.get('/amc', async (req, res) => {
  try {
    const data = await AMC.find().sort({ endDate: 1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/amc', async (req, res) => {
  try {
    const count = await AMC.countDocuments();
    const amcNumber = `AMC-2026-${String(count + 1).padStart(3, '0')}`;
    const data = new AMC({ ...req.body, amcNumber });
    await data.save();
    res.status(201).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
