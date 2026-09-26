import express from 'express';
import User from '../../models/User.js';
import AuditLog from './models/AuditLog.js';

const router = express.Router();



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

// DATABASE & BACKUP ADMINISTRATION
import multer from 'multer';
import DatabaseService from './databaseService.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

// Backward compatible run backup endpoint
router.post('/backup/run', async (req, res) => {
  try {
    const backup = await DatabaseService.saveServerBackup(req.user?.username || 'admin');
    res.json({
      message: 'System backup generated successfully',
      timestamp: new Date(),
      backupId: backup.filename,
      size: backup.formattedSize
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 1. Get all collections with live stats and risk categorization
router.get('/database/collections', async (req, res) => {
  try {
    const stats = await DatabaseService.getCollectionsStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Factory wipe operational transactions
router.post('/database/wipe-transactional', async (req, res) => {
  try {
    const result = await DatabaseService.wipeTransactionalData(req.user?.username || 'admin');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Wipe a specific collection
router.post('/database/collections/:name/wipe', async (req, res) => {
  try {
    const result = await DatabaseService.wipeCollection(req.params.name, req.user?.username || 'admin');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Get paginated documents of a collection
router.get('/database/collections/:name/documents', async (req, res) => {
  try {
    const result = await DatabaseService.getCollectionDocuments(req.params.name, req.query);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Insert new document
router.post('/database/collections/:name/documents', async (req, res) => {
  try {
    const result = await DatabaseService.insertDocument(req.params.name, req.body, req.user?.username || 'admin');
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 6. Update document by ID (Edit)
router.put('/database/collections/:name/documents/:id', async (req, res) => {
  try {
    const result = await DatabaseService.updateDocument(req.params.name, req.params.id, req.body, req.user?.username || 'admin');
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 7. Delete document by ID (Delete)
router.delete('/database/collections/:name/documents/:id', async (req, res) => {
  try {
    const result = await DatabaseService.deleteDocument(req.params.name, req.params.id, req.user?.username || 'admin');
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 8. Export collection as JSON or CSV
router.get('/database/collections/:name/export', async (req, res) => {
  try {
    const format = req.query.format || 'json';
    const result = await DatabaseService.exportCollection(req.params.name, format);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.content);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Import documents into collection
router.post('/database/collections/:name/import', upload.single('file'), async (req, res) => {
  try {
    let docs = req.body.documents;
    if (typeof docs === 'string') {
      try { docs = JSON.parse(docs); } catch { /* ignore */ }
    }

    if (req.file) {
      const content = req.file.buffer.toString('utf-8');
      if (req.file.originalname.endsWith('.json')) {
        docs = JSON.parse(content);
      } else if (req.file.originalname.endsWith('.csv')) {
        // Basic CSV parser
        const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length > 1) {
          const headers = lines[0].split(',').map((h) => h.replace(/^["']|["']$/g, '').trim());
          docs = lines.slice(1).map((line) => {
            const values = line.split(',').map((v) => v.replace(/^["']|["']$/g, '').trim());
            const obj = {};
            headers.forEach((h, idx) => {
              obj[h] = values[idx];
            });
            return obj;
          });
        }
      }
    }

    if (!Array.isArray(docs)) {
      return res.status(400).json({ error: 'Data must be a JSON array of documents or a valid CSV file' });
    }

    const result = await DatabaseService.importCollection(req.params.name, docs, req.user?.username || 'admin');
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 10. Direct browser download of complete database backup
router.get('/database/backup/download', async (req, res) => {
  try {
    const dump = await DatabaseService.createBackupDump();
    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="backup_${timestampStr}.json"`);
    res.send(JSON.stringify(dump, null, 2));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 10.1 Get backup directory location info
router.get('/database/backup/location', (req, res) => {
  try {
    const info = DatabaseService.getBackupDirectoryInfo();
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 10.2 Set custom backup directory location
router.post('/database/backup/location', async (req, res) => {
  try {
    const { directory } = req.body;
    const result = await DatabaseService.setBackupDirectory(directory, req.user?.username || 'admin');
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 10.3 Open current backup directory in local File Explorer
router.post('/database/backup/open-folder', (req, res) => {
  try {
    const { directory } = req.body;
    const result = DatabaseService.openBackupFolderInExplorer(directory);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 11. Create a server-side backup snapshot
router.post('/database/backup/server', async (req, res) => {
  try {
    const { directory } = req.body;
    const result = await DatabaseService.saveServerBackup(req.user?.username || 'admin', 'backup', directory);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 12. List all server backups
router.get('/database/backups', async (req, res) => {
  try {
    const { directory } = req.query;
    const backups = await DatabaseService.listServerBackups(directory);
    res.json(backups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 13. Download a specific server backup file
router.get('/database/backups/:filename/download', async (req, res) => {
  try {
    const filepath = DatabaseService.getServerBackupFilePath(req.params.filename);
    res.download(filepath, req.params.filename);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// 14. Delete a specific server backup file
router.delete('/database/backups/:filename', async (req, res) => {
  try {
    const result = await DatabaseService.deleteServerBackup(req.params.filename, req.user?.username || 'admin');
    res.json(result);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// 15. Restore database from an existing server backup
router.post('/database/backups/:filename/restore', async (req, res) => {
  try {
    const result = await DatabaseService.restoreFromServerBackup(req.params.filename, req.user?.username || 'admin');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 16. Restore database from an uploaded JSON backup file
router.post('/database/restore/upload', upload.single('backupFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please upload a JSON backup file' });
    }
    const content = req.file.buffer.toString('utf-8');
    const backupData = JSON.parse(content);
    const result = await DatabaseService.restoreFromBackupData(backupData, req.user?.username || 'admin');
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
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
