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
