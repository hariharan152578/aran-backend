import express from 'express';
import mongoose from 'mongoose';

const router = express.Router();

// GET base status
router.get('/', (req, res) => {
  res.json({ message: 'Aran ERP: Templates module is active' });
});

// GET /list - returns all uploaded templates
router.get('/list', async (req, res) => {
  try {
    const templatesColl = mongoose.connection.db.collection('templates');
    const templates = await templatesColl.find({}).sort({ uploadDate: -1 }).toArray();
    
    // Seed initial templates if empty
    if (templates.length === 0) {
      const mockTemplates = [
        { name: 'FIX.xlsx', version: 'v1.0.0', configuration: 'FIX', filename: 'FIX.xlsx', size: '24 KB', uploadDate: new Date(Date.now() - 86400000 * 3) },
        { name: 'SL-SL.xlsx', version: 'v1.2.0', configuration: 'SL-SL', filename: 'SL-SL.xlsx', size: '32 KB', uploadDate: new Date(Date.now() - 86400000 * 2) },
        { name: 'OP-OP-OP.xlsx', version: 'v1.1.0', configuration: 'OP-OP-OP', filename: 'OP-OP-OP.xlsx', size: '48 KB', uploadDate: new Date(Date.now() - 86400000) }
      ];
      await templatesColl.insertMany(mockTemplates);
      return res.json(mockTemplates);
    }

    res.json(templates);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /upload - mock uploads new excel template metadata
router.post('/upload', async (req, res) => {
  try {
    const { name, version, configuration, filename, size } = req.body;

    if (!name || !version || !configuration || !filename) {
      return res.status(400).json({ message: 'Please provide all required fields' });
    }

    const templatesColl = mongoose.connection.db.collection('templates');
    const newTemplate = {
      name,
      version,
      configuration,
      filename,
      size: size || '15 KB',
      uploadDate: new Date()
    };

    await templatesColl.insertOne(newTemplate);
    res.status(201).json(newTemplate);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
