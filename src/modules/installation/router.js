import express from 'express';
import InstallationTeam from './models/InstallationTeam.js';
import InstallationOrder from './models/InstallationOrder.js';

const router = express.Router();



// TEAMS
router.get('/teams', async (req, res) => {
  try {
    const data = await InstallationTeam.find().sort({ teamName: 1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/teams', async (req, res) => {
  try {
    const data = new InstallationTeam(req.body);
    await data.save();
    res.status(201).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ORDERS
router.get('/orders', async (req, res) => {
  try {
    const data = await InstallationOrder.find().populate('orderId').populate('teamId').sort({ createdAt: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/orders/:id', async (req, res) => {
  try {
    const data = await InstallationOrder.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
