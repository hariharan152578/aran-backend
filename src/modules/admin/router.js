import express from 'express';
import User from '../../models/User.js';
import AuditLog from './models/AuditLog.js';

const router = express.Router();

// Helper to seed initial audit logs
const ensureAuditLogs = async () => {
  const count = await AuditLog.countDocuments();
  if (count === 0) {
    await AuditLog.insertMany([
      { action: 'Login', module: 'Auth', user: 'admin', details: 'Successful administrator login' },
      { action: 'Template Created', module: 'Configuration', user: 'admin', details: 'Seeded system twin template' },
      { action: 'Database Seeded', module: 'System', user: 'admin', details: 'Initial database rule engine structures seeded' }
    ]);
  }
};

// USERS
router.get('/users', async (req, res) => {
  try {
    const data = await User.find().select('-password').sort({ username: 1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/users', async (req, res) => {
  try {
    const data = new User(req.body);
    await data.save();
    res.status(201).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// AUDIT LOGS
router.get('/audit-logs', async (req, res) => {
  try {
    await ensureAuditLogs();
    const data = await AuditLog.find().sort({ createdAt: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/audit-logs', async (req, res) => {
  try {
    const data = new AuditLog(req.body);
    await data.save();
    res.status(201).json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// BACKUP & RESTORE
router.post('/backup/run', async (req, res) => {
  try {
    const log = new AuditLog({
      action: 'Backup Executed',
      module: 'Admin',
      user: 'admin',
      details: 'Full system backup downloaded'
    });
    await log.save();
    res.json({ message: 'System backup generated successfully', timestamp: new Date(), backupId: 'BKUP-2026-06-14-01' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// COMPANY SETTINGS
let companySettings = {
  companyName: 'Aran Window Solutions Ltd',
  address: '100 Innovation Way, Tech Park, Bangalore',
  taxId: 'GST-9988776655',
  currency: 'INR'
};

router.get('/company-settings', (req, res) => {
  res.json(companySettings);
});

router.put('/company-settings', (req, res) => {
  companySettings = { ...companySettings, ...req.body };
  res.json(companySettings);
});

export default router;
