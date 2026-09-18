import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import AuditLog from './models/AuditLog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKUPS_DIR = path.resolve(__dirname, '../../../backups');

// Ensure backups directory exists
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

// Collection classification dictionary
const KNOWN_COLLECTIONS = {
  orders: { displayName: 'Sales Orders', schema: 'Order', module: 'Sales & Transactions', severity: 'OPERATIONAL DATA' },
  order_timelines: { displayName: 'Order Timelines', schema: 'OrderTimeline', module: 'Sales & Transactions', severity: 'TRANSIENT LOG' },
  invoices: { displayName: 'Invoices', schema: 'Invoice', module: 'Sales & Transactions', severity: 'OPERATIONAL DATA' },
  payments: { displayName: 'Payments', schema: 'Payment', module: 'Sales & Transactions', severity: 'OPERATIONAL DATA' },
  refunds: { displayName: 'Refunds', schema: 'Refund', module: 'Sales & Transactions', severity: 'OPERATIONAL DATA' },
  salesreturns: { displayName: 'Sales Returns', schema: 'SalesReturn', module: 'Sales & Transactions', severity: 'OPERATIONAL DATA' },
  salessnapshots: { displayName: 'Sales Snapshots', schema: 'SalesSnapshot', module: 'Sales & Transactions', severity: 'TRANSIENT LOG' },
  quotations: { displayName: 'Quotations', schema: 'Quotation', module: 'Sales & Transactions', severity: 'OPERATIONAL DATA' },
  quotationcategories: { displayName: 'Quotation Categories', schema: 'QuotationCategory', module: 'Sales & Transactions', severity: 'OPERATIONAL DATA' },
  enquiries: { displayName: 'Sales Enquiries', schema: 'Enquiry', module: 'Sales & Transactions', severity: 'OPERATIONAL DATA' },
  purchaseorders: { displayName: 'Purchase Orders', schema: 'PurchaseOrder', module: 'Inventory & Procurement', severity: 'OPERATIONAL DATA' },
  purchasebills: { displayName: 'Purchase Bills', schema: 'PurchaseBill', module: 'Inventory & Procurement', severity: 'OPERATIONAL DATA' },
  grns: { displayName: 'Goods Receipt Notes (GRN)', schema: 'GRN', module: 'Inventory & Procurement', severity: 'OPERATIONAL DATA' },
  stockitems: { displayName: 'Stock Items', schema: 'StockItem', module: 'Inventory & Procurement', severity: 'OPERATIONAL DATA' },
  inventoryadjustments: { displayName: 'Inventory Adjustments', schema: 'InventoryAdjustment', module: 'Inventory & Procurement', severity: 'OPERATIONAL DATA' },
  expenses: { displayName: 'Direct Expenses', schema: 'Expense', module: 'Accounts & Finance', severity: 'OPERATIONAL DATA' },
  customers: { displayName: 'Customers Registry', schema: 'Customer', module: 'CRM & Parties', severity: 'CRITICAL MASTER' },
  suppliers: { displayName: 'Suppliers Registry', schema: 'Supplier', module: 'CRM & Parties', severity: 'CRITICAL MASTER' },
  partycategories: { displayName: 'Party Categories', schema: 'PartyCategory', module: 'CRM & Parties', severity: 'CRITICAL MASTER' },
  followups: { displayName: 'Lead Follow-ups', schema: 'Followup', module: 'CRM & Parties', severity: 'OPERATIONAL DATA' },
  users: { displayName: 'User Accounts & Logins', schema: 'User', module: 'Administration', severity: 'CRITICAL MASTER' },
  auditlogs: { displayName: 'Audit Activity Logs', schema: 'AuditLog', module: 'Administration', severity: 'TRANSIENT LOG' },
  excel_import_logs: { displayName: 'Excel Import Logs', schema: 'ExcelImportLog', module: 'Administration', severity: 'TRANSIENT LOG' },
  importlogs: { displayName: 'System Import Logs', schema: 'ImportLog', module: 'Administration', severity: 'TRANSIENT LOG' },
  templates: { displayName: 'Product Templates', schema: 'Template', module: 'Master Configuration', severity: 'CRITICAL MASTER' },
  template_registry: { displayName: 'Template Registry', schema: 'TemplateRegistry', module: 'Master Configuration', severity: 'CRITICAL MASTER' },
  templateversions: { displayName: 'Template Versions', schema: 'TemplateVersion', module: 'Master Configuration', severity: 'CRITICAL MASTER' },
  templateformulas: { displayName: 'Template Formulas', schema: 'TemplateFormula', module: 'Master Configuration', severity: 'CRITICAL MASTER' },
  templatesheetstructures: { displayName: 'Sheet Structures', schema: 'TemplateSheetStructure', module: 'Master Configuration', severity: 'CRITICAL MASTER' },
  templatevariants: { displayName: 'Template Variants', schema: 'TemplateVariant', module: 'Master Configuration', severity: 'CRITICAL MASTER' },
  templatefeatures: { displayName: 'Template Features', schema: 'TemplateFeature', module: 'Master Configuration', severity: 'CRITICAL MASTER' },
  templateboms: { displayName: 'Template BOMs', schema: 'TemplateBOM', module: 'Master Configuration', severity: 'CRITICAL MASTER' },
  templatehardwares: { displayName: 'Template Hardware', schema: 'TemplateHardware', module: 'Master Configuration', severity: 'CRITICAL MASTER' },
  templateglasses: { displayName: 'Template Glasses', schema: 'TemplateGlass', module: 'Master Configuration', severity: 'CRITICAL MASTER' },
  templatepricings: { displayName: 'Template Pricing Rules', schema: 'TemplatePricing', module: 'Master Configuration', severity: 'CRITICAL MASTER' },
  templatemeasurements: { displayName: 'Template Measurements', schema: 'TemplateMeasurement', module: 'Master Configuration', severity: 'CRITICAL MASTER' },
  templateextractionreviews: { displayName: 'Extraction Reviews', schema: 'TemplateExtractionReview', module: 'Master Configuration', severity: 'OPERATIONAL DATA' },
  formulas: { displayName: 'System Formulas', schema: 'Formula', module: 'Master Configuration', severity: 'CRITICAL MASTER' },
  formula_rules: { displayName: 'Formula Rules', schema: 'FormulaRule', module: 'Master Configuration', severity: 'CRITICAL MASTER' },
  formula_groups: { displayName: 'Formula Groups', schema: 'FormulaGroup', module: 'Master Configuration', severity: 'CRITICAL MASTER' },
  products: { displayName: 'Products Catalog', schema: 'Product', module: 'Master Configuration', severity: 'CRITICAL MASTER' },
  product_features: { displayName: 'Product Features', schema: 'ProductFeature', module: 'Master Configuration', severity: 'CRITICAL MASTER' },
  categories: { displayName: 'Product Categories', schema: 'Category', module: 'Master Configuration', severity: 'CRITICAL MASTER' },
  brands: { displayName: 'Brand Registry', schema: 'Brand', module: 'Master Configuration', severity: 'CRITICAL MASTER' },
  series: { displayName: 'Product Series', schema: 'Series', module: 'Master Configuration', severity: 'CRITICAL MASTER' },
  systems: { displayName: 'Window Systems', schema: 'System', module: 'Master Configuration', severity: 'CRITICAL MASTER' },
  mechanisms: { displayName: 'Hardware Mechanisms', schema: 'Mechanism', module: 'Master Configuration', severity: 'CRITICAL MASTER' },
  presets: { displayName: 'Configuration Presets', schema: 'Preset', module: 'Master Configuration', severity: 'CRITICAL MASTER' },
  profiledescriptions: { displayName: 'Profile Descriptions', schema: 'ProfileDescription', module: 'Master Configuration', severity: 'CRITICAL MASTER' },
  feature_library: { displayName: 'Feature Library', schema: 'FeatureLibrary', module: 'Master Configuration', severity: 'CRITICAL MASTER' },
  feature_values: { displayName: 'Feature Values', schema: 'FeatureValue', module: 'Master Configuration', severity: 'CRITICAL MASTER' },
  features: { displayName: 'Feature Attributes', schema: 'Feature', module: 'Master Configuration', severity: 'CRITICAL MASTER' },
  pricing_rules: { displayName: 'Global Pricing Rules', schema: 'PricingRule', module: 'Master Configuration', severity: 'CRITICAL MASTER' },
  recognitionrules: { displayName: 'Recognition Rules', schema: 'RecognitionRule', module: 'Master Configuration', severity: 'CRITICAL MASTER' },
  measurement_templates: { displayName: 'Measurement Templates', schema: 'MeasurementTemplate', module: 'Master Configuration', severity: 'CRITICAL MASTER' },
  measurementrules: { displayName: 'Measurement Rules', schema: 'MeasurementRule', module: 'Master Configuration', severity: 'CRITICAL MASTER' },
  bom_rules: { displayName: 'BOM Calculation Rules', schema: 'BOMRule', module: 'Master Configuration', severity: 'CRITICAL MASTER' },
  bomrules: { displayName: 'BOM Rule Registry', schema: 'BOMRules', module: 'Master Configuration', severity: 'CRITICAL MASTER' },
  output_mappings: { displayName: 'Output Mappings', schema: 'OutputMapping', module: 'Master Configuration', severity: 'CRITICAL MASTER' },
  configuration_workbook_scans: { displayName: 'Workbook Scans', schema: 'WorkbookScan', module: 'Master Configuration', severity: 'OPERATIONAL DATA' },
  configuration_nodes: { displayName: 'Config Graph Nodes', schema: 'ConfigNode', module: 'Master Configuration', severity: 'OPERATIONAL DATA' },
  configuration_graph_nodes: { displayName: 'Graph Nodes', schema: 'GraphNode', module: 'Master Configuration', severity: 'OPERATIONAL DATA' },
  configuration_graph_edges: { displayName: 'Graph Edges', schema: 'GraphEdge', module: 'Master Configuration', severity: 'OPERATIONAL DATA' },
  configurations: { displayName: 'Saved Configurations', schema: 'Configuration', module: 'Production & Manufacturing', severity: 'OPERATIONAL DATA' },
  productioncards: { displayName: 'Production Job Cards', schema: 'ProductionCard', module: 'Production & Manufacturing', severity: 'OPERATIONAL DATA' },
  dispatchorders: { displayName: 'Dispatch Shipments', schema: 'DispatchOrder', module: 'Logistics & Dispatch', severity: 'OPERATIONAL DATA' },
  couriers: { displayName: 'Couriers & Carriers', schema: 'Courier', module: 'Logistics & Dispatch', severity: 'OPERATIONAL DATA' },
  vehicles: { displayName: 'Delivery Vehicles', schema: 'Vehicle', module: 'Logistics & Dispatch', severity: 'OPERATIONAL DATA' },
  installationorders: { displayName: 'Site Installation Orders', schema: 'InstallationOrder', module: 'Site & Installation', severity: 'OPERATIONAL DATA' },
  installationteams: { displayName: 'Installation Teams', schema: 'InstallationTeam', module: 'Site & Installation', severity: 'OPERATIONAL DATA' },
  complaints: { displayName: 'Customer Complaints', schema: 'Complaint', module: 'Customer Service & AMC', severity: 'OPERATIONAL DATA' },
  warrantycards: { displayName: 'Warranty Certificates', schema: 'WarrantyCard', module: 'Customer Service & AMC', severity: 'OPERATIONAL DATA' },
  amcs: { displayName: 'Annual Maintenance Contracts', schema: 'AMC', module: 'Customer Service & AMC', severity: 'OPERATIONAL DATA' }
};

// Collections considered strictly transactional for factory wipe
const TRANSACTIONAL_COLLECTIONS = [
  'orders',
  'order_timelines',
  'invoices',
  'payments',
  'refunds',
  'salesreturns',
  'salessnapshots',
  'quotations',
  'enquiries',
  'purchaseorders',
  'purchasebills',
  'grns',
  'inventoryadjustments',
  'expenses',
  'dispatchorders',
  'installationorders',
  'productioncards',
  'configurations',
  'auditlogs',
  'excel_import_logs',
  'importlogs',
  'complaints',
  'warrantycards',
  'amcs',
  'followups'
];

function formatDisplayName(name) {
  return name
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

function toIdQuery(id) {
  if (!id) return null;
  const queries = [{ _id: id }];
  if (mongoose.Types.ObjectId.isValid(id)) {
    queries.push({ _id: new mongoose.Types.ObjectId(id) });
  }
  return { $or: queries };
}

export class DatabaseService {
  /**
   * List all collections with real document counts and categorization
   */
  static async getCollectionsStats() {
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    
    const stats = await Promise.all(
      collections.map(async (col) => {
        const name = col.name;
        // Ignore internal system collections
        if (name.startsWith('system.')) return null;

        const count = await db.collection(name).countDocuments();
        const known = KNOWN_COLLECTIONS[name.toLowerCase()] || {};

        return {
          name,
          displayName: known.displayName || formatDisplayName(name),
          schema: known.schema || name,
          module: known.module || 'General & System',
          severity: known.severity || 'OPERATIONAL DATA',
          count
        };
      })
    );

    const validStats = stats.filter(Boolean);
    // Sort critical masters first, then operational, then transient logs
    const severityOrder = { 'CRITICAL MASTER': 1, 'OPERATIONAL DATA': 2, 'TRANSIENT LOG': 3 };
    validStats.sort((a, b) => {
      const diff = (severityOrder[a.severity] || 9) - (severityOrder[b.severity] || 9);
      if (diff !== 0) return diff;
      return a.displayName.localeCompare(b.displayName);
    });

    const totalRecords = validStats.reduce((acc, curr) => acc + curr.count, 0);

    return {
      totalCollections: validStats.length,
      totalRecords,
      collections: validStats
    };
  }

  /**
   * Wipe all documents in a specific collection
   */
  static async wipeCollection(collectionName, user = 'admin') {
    const db = mongoose.connection.db;
    const collection = db.collection(collectionName);
    const countBefore = await collection.countDocuments();
    
    await collection.deleteMany({});

    await AuditLog.create({
      action: 'Collection Wiped',
      module: 'Database Administration',
      user,
      details: `Purged ${countBefore} documents from collection '${collectionName}'`
    });

    return {
      collection: collectionName,
      wipedCount: countBefore
    };
  }

  /**
   * Factory clean database: Wipe operational transactions while preserving master configs, products, and users
   */
  static async wipeTransactionalData(user = 'admin') {
    const db = mongoose.connection.db;
    
    // Automatically save safety backup before wiping
    let safetyBackup = null;
    try {
      safetyBackup = await this.saveServerBackup(user, 'pre_wipe_safety');
    } catch (err) {
      console.warn('Safety backup warning:', err.message);
    }

    const collections = await db.listCollections().toArray();
    const existingColNames = collections.map((c) => c.name);

    const report = [];
    let totalWiped = 0;

    for (const name of TRANSACTIONAL_COLLECTIONS) {
      if (existingColNames.includes(name)) {
        const col = db.collection(name);
        const count = await col.countDocuments();
        if (count > 0) {
          await col.deleteMany({});
          report.push({ collection: name, count });
          totalWiped += count;
        }
      }
    }

    await AuditLog.create({
      action: 'Factory Database Reset',
      module: 'Database Administration',
      user,
      details: `Factory clean completed: ${totalWiped} operational records purged across ${report.length} collections. Safety backup: ${safetyBackup?.filename || 'none'}`
    });

    return {
      success: true,
      totalWiped,
      safetyBackup: safetyBackup?.filename || null,
      wipedCollections: report
    };
  }

  /**
   * Get paginated documents from a collection with optional search
   */
  static async getCollectionDocuments(collectionName, { page = 1, limit = 20, search = '' }) {
    const db = mongoose.connection.db;
    const collection = db.collection(collectionName);

    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (p - 1) * l;

    let query = {};
    if (search && search.trim()) {
      const q = search.trim();

      // Check if user entered raw JSON query e.g. {"status": "pending"}
      if (q.startsWith('{') && q.endsWith('}')) {
        try {
          query = JSON.parse(q);
        } catch {
          // fallback to search
        }
      }

      if (Object.keys(query).length === 0) {
        const orConditions = [];
        if (mongoose.Types.ObjectId.isValid(q)) {
          orConditions.push({ _id: new mongoose.Types.ObjectId(q) });
        }
        orConditions.push({ _id: q });

        // Regex search across common fields if present
        const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        const commonFields = [
          'name', 'title', 'code', 'orderNumber', 'invoiceNumber', 'voucherNumber',
          'email', 'username', 'category', 'status', 'description', 'module', 'action'
        ];
        commonFields.forEach((field) => {
          orConditions.push({ [field]: regex });
        });

        query = { $or: orConditions };
      }
    }

    const total = await collection.countDocuments(query);
    const documents = await collection
      .find(query)
      .sort({ _id: -1 })
      .skip(skip)
      .limit(l)
      .toArray();

    return {
      collection: collectionName,
      page: p,
      limit: l,
      total,
      totalPages: Math.ceil(total / l) || 1,
      documents
    };
  }

  /**
   * Insert a new document into collection
   */
  static async insertDocument(collectionName, data, user = 'admin') {
    const db = mongoose.connection.db;
    const collection = db.collection(collectionName);

    const doc = { ...data };
    if (doc._id && mongoose.Types.ObjectId.isValid(doc._id)) {
      doc._id = new mongoose.Types.ObjectId(doc._id);
    }

    const result = await collection.insertOne(doc);
    const inserted = await collection.findOne({ _id: result.insertedId });

    await AuditLog.create({
      action: 'Document Created',
      module: 'Database Administration',
      user,
      details: `Inserted new record in '${collectionName}' with ID ${result.insertedId}`
    });

    return inserted;
  }

  /**
   * Update or replace a document in collection by _id
   */
  static async updateDocument(collectionName, id, updateData, user = 'admin') {
    const db = mongoose.connection.db;
    const collection = db.collection(collectionName);
    const query = toIdQuery(id);

    if (!query) throw new Error('Invalid document ID provided');

    // Protect _id from being overwritten with incompatible type
    const payload = { ...updateData };
    delete payload._id;

    const result = await collection.findOneAndUpdate(
      query,
      { $set: payload },
      { returnDocument: 'after' }
    );

    if (!result) {
      throw new Error(`Document with ID '${id}' not found in '${collectionName}'`);
    }

    await AuditLog.create({
      action: 'Document Updated',
      module: 'Database Administration',
      user,
      details: `Updated document ${id} in collection '${collectionName}'`
    });

    return result;
  }

  /**
   * Delete a single document by _id
   */
  static async deleteDocument(collectionName, id, user = 'admin') {
    const db = mongoose.connection.db;
    const collection = db.collection(collectionName);
    const query = toIdQuery(id);

    if (!query) throw new Error('Invalid document ID provided');

    const result = await collection.deleteOne(query);
    if (result.deletedCount === 0) {
      throw new Error(`Document with ID '${id}' not found in '${collectionName}'`);
    }

    await AuditLog.create({
      action: 'Document Deleted',
      module: 'Database Administration',
      user,
      details: `Deleted record ${id} from collection '${collectionName}'`
    });

    return { success: true, deletedId: id };
  }

  /**
   * Export all documents of a collection as JSON or CSV
   */
  static async exportCollection(collectionName, format = 'json') {
    const db = mongoose.connection.db;
    const documents = await db.collection(collectionName).find({}).toArray();

    if (format.toLowerCase() === 'csv') {
      if (documents.length === 0) {
        return { content: '_id\n', contentType: 'text/csv', filename: `${collectionName}_export.csv` };
      }

      // Collect all keys
      const allKeys = Array.from(
        new Set(documents.flatMap((doc) => Object.keys(doc)))
      );

      const headerRow = allKeys.map((k) => `"${k.replace(/"/g, '""')}"`).join(',');
      const rows = documents.map((doc) => {
        return allKeys
          .map((key) => {
            const val = doc[key];
            if (val === undefined || val === null) return '""';
            if (typeof val === 'object') {
              return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
            }
            return `"${String(val).replace(/"/g, '""')}"`;
          })
          .join(',');
      });

      return {
        content: [headerRow, ...rows].join('\n'),
        contentType: 'text/csv',
        filename: `${collectionName}_export.csv`
      };
    }

    // Default: formatted JSON
    return {
      content: JSON.stringify(documents, null, 2),
      contentType: 'application/json',
      filename: `${collectionName}_export.json`
    };
  }

  /**
   * Import documents into a collection
   */
  static async importCollection(collectionName, documents, user = 'admin') {
    if (!Array.isArray(documents) || documents.length === 0) {
      throw new Error('Import data must be a non-empty array of objects');
    }

    const db = mongoose.connection.db;
    const collection = db.collection(collectionName);

    // Convert _id strings to ObjectIds where valid
    const cleanDocs = documents.map((doc) => {
      const item = { ...doc };
      if (item._id && typeof item._id === 'string' && mongoose.Types.ObjectId.isValid(item._id)) {
        item._id = new mongoose.Types.ObjectId(item._id);
      }
      return item;
    });

    const result = await collection.insertMany(cleanDocs, { ordered: false });

    await AuditLog.create({
      action: 'Collection Data Imported',
      module: 'Database Administration',
      user,
      details: `Imported ${result.insertedCount} documents into collection '${collectionName}'`
    });

    return {
      success: true,
      insertedCount: result.insertedCount
    };
  }

  /**
   * Create a complete JSON dump of all collections
   */
  static async createBackupDump() {
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();

    const dump = {
      app: 'Aran ERP',
      version: '2.0',
      exportedAt: new Date().toISOString(),
      collections: {}
    };

    for (const col of collections) {
      if (col.name.startsWith('system.')) continue;
      const docs = await db.collection(col.name).find({}).toArray();
      dump.collections[col.name] = docs;
    }

    return dump;
  }

  /**
   * Save a backup snapshot to the local server's backups directory
   */
  static async saveServerBackup(user = 'admin', prefix = 'backup') {
    const dump = await this.createBackupDump();
    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${prefix}_${timestampStr}.json`;
    const filepath = path.join(BACKUPS_DIR, filename);

    const jsonStr = JSON.stringify(dump, null, 2);
    fs.writeFileSync(filepath, jsonStr, 'utf-8');

    const stats = fs.statSync(filepath);

    await AuditLog.create({
      action: 'Server Backup Created',
      module: 'Database Administration',
      user,
      details: `Generated server snapshot '${filename}' (${(stats.size / 1024).toFixed(2)} KB)`
    });

    return {
      filename,
      sizeBytes: stats.size,
      formattedSize: `${(stats.size / 1024).toFixed(2)} KB`,
      createdAt: stats.birthtime || stats.mtime
    };
  }

  /**
   * List all server backup files
   */
  static async listServerBackups() {
    if (!fs.existsSync(BACKUPS_DIR)) {
      return [];
    }

    const files = fs.readdirSync(BACKUPS_DIR);
    const backups = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const filepath = path.join(BACKUPS_DIR, file);
        try {
          const stats = fs.statSync(filepath);
          backups.push({
            filename: file,
            sizeBytes: stats.size,
            formattedSize: `${(stats.size / 1024).toFixed(2)} KB`,
            createdAt: stats.birthtime || stats.mtime
          });
        } catch (err) {
          console.warn(`Could not stat backup file ${file}:`, err.message);
        }
      }
    }

    // Sort newest first
    backups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return backups;
  }

  /**
   * Get absolute filepath for a server backup
   */
  static getServerBackupFilePath(filename) {
    const sanitized = path.basename(filename);
    const filepath = path.join(BACKUPS_DIR, sanitized);
    if (!fs.existsSync(filepath)) {
      throw new Error(`Backup file '${filename}' not found on server`);
    }
    return filepath;
  }

  /**
   * Delete a server backup file
   */
  static async deleteServerBackup(filename, user = 'admin') {
    const filepath = this.getServerBackupFilePath(filename);
    fs.unlinkSync(filepath);

    await AuditLog.create({
      action: 'Server Backup Deleted',
      module: 'Database Administration',
      user,
      details: `Removed server backup '${filename}'`
    });

    return { success: true, filename };
  }

  /**
   * Restore database collections from a JSON backup data object
   */
  static async restoreFromBackupData(backupData, user = 'admin') {
    if (!backupData || !backupData.collections || typeof backupData.collections !== 'object') {
      throw new Error('Invalid backup file structure: missing collections dictionary');
    }

    const db = mongoose.connection.db;
    const collectionsMap = backupData.collections;
    const results = [];
    let totalRestored = 0;

    for (const [colName, docs] of Object.entries(collectionsMap)) {
      if (!Array.isArray(docs)) continue;
      const col = db.collection(colName);
      
      // Clear collection before restoring
      await col.deleteMany({});

      if (docs.length > 0) {
        // Convert string _id to ObjectId where appropriate
        const prepared = docs.map((doc) => {
          const item = { ...doc };
          if (item._id && typeof item._id === 'string' && mongoose.Types.ObjectId.isValid(item._id)) {
            item._id = new mongoose.Types.ObjectId(item._id);
          }
          return item;
        });

        await col.insertMany(prepared, { ordered: false });
        totalRestored += docs.length;
      }

      results.push({ collection: colName, count: docs.length });
    }

    await AuditLog.create({
      action: 'Database Restored',
      module: 'Database Administration',
      user,
      details: `Restored ${totalRestored} documents across ${results.length} collections`
    });

    return {
      success: true,
      totalRestored,
      collectionsRestored: results.length,
      details: results
    };
  }

  /**
   * Restore database from a server backup file
   */
  static async restoreFromServerBackup(filename, user = 'admin') {
    const filepath = this.getServerBackupFilePath(filename);
    const content = fs.readFileSync(filepath, 'utf-8');
    const data = JSON.parse(content);

    return this.restoreFromBackupData(data, user);
  }
}

export default DatabaseService;
