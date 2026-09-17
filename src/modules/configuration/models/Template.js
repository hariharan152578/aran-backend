import mongoose from 'mongoose';

const TemplateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  subcategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  folderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  version: { type: String, default: '1.0' },
  status: { type: String, enum: ['DRAFT', 'IMPORTED', 'VALIDATED', 'SIMULATION_PASSED', 'PUBLISHED', 'ARCHIVED'], default: 'IMPORTED' },
  description: { type: String, default: '' },
  thumbnail: { type: String, default: '' },
  analysisReport: { type: Object, default: null },
  structuralHash: { type: String, default: null },
  templateType: { type: String, enum: ['JSON_RULES', 'REACT_COMPONENT', 'GOOGLE_SHEET', 'EXCEL'], default: 'JSON_RULES' },
  reactCode: { type: String, default: '' },

  /**
   * Direct Excel workbook metadata when templateType === 'EXCEL'.
   * Allows uploading .xlsx files directly into the system, bypassing Google Sheets.
   */
  excelWorkbook: {
    originalFileName: { type: String, default: '' },
    filePath: { type: String, default: '' },
    fileSize: { type: Number, default: 0 },
    uploadedAt: { type: Date, default: null }
  },

  /**
   * Binding to a Google Apps Script Web App that fronts a real spreadsheet.
   * Only populated when templateType === 'GOOGLE_SHEET'; every field is
   * defaulted, so existing JSON_RULES and REACT_COMPONENT documents are
   * unaffected and need no migration.
   *
   * The spreadsheet does the arithmetic. Aran posts window dimensions and reads
   * back the recalculated grid, instead of re-implementing the formulas the way
   * the JSON_RULES pipeline does.
   */
  googleSheet: {
    // The deployed /exec URL. One workbook can back several templates, one per
    // tab, so this is not unique across templates.
    webAppUrl: { type: String, default: '' },
    // The single tab this template drives - what doPost writes into.
    sheetName: { type: String, default: '' },
    // Where consumed-material totals live. Varies per workbook
    // ("Material & Hardware", "Profile & Hardwares"), so it must be stored
    // rather than assumed.
    materialSheetName: { type: String, default: '' },

    verifiedAt: { type: Date, default: null },
    // Every tab seen at verify time - lets the UI explain "the tab you chose no
    // longer exists" instead of failing opaquely.
    verifiedTabs: [{ type: String }],
    lastCalculatedAt: { type: Date, default: null },
    lastError: { type: String, default: '' },

    /**
     * Input columns as Apps Script detected them, captured at verify time.
     * Surfaced in the tab picker so a misdetection is visible BEFORE saving:
     * older deployments of Code.gs could latch onto a derived block (e.g.
     * width=N, height=P at row 24 - the steel-cutting table) instead of the
     * customer input block at B/C row 5, and would then write dimensions into
     * the wrong table and mis-calculate silently.
     */
    inputHints: {
      wNoCol: { type: String, default: null },
      widthCol: { type: String, default: null },
      heightCol: { type: String, default: null },
      headerRow: { type: Number, default: null },
      dataStartRow: { type: Number, default: null },
      dataEndRow: { type: Number, default: null }
    },

    /**
     * How the material tab's grid is turned into the structured BOM lists that
     * ProductionCard, dispatch and reports already consume.
     *
     * Auto-detected on save, then editable, because detection cannot be trusted
     * blind: the category comes from a free-text section title someone typed,
     * and the quantity column's header is the order number rather than "Qty",
     * so it has to be found by position and data type.
     */
    materialMapping: {
      mode: { type: String, enum: ['AUTO', 'MANUAL'], default: 'AUTO' },
      blocks: [{
        // Section title the block was found under, e.g. "Steel Consumed for this order".
        label: { type: String, default: '' },
        category: {
          type: String,
          enum: ['Profiles', 'Glass', 'Hardware', 'Accessories', 'Consumables', 'Labor'],
          default: 'Profiles'
        },
        group: { type: String, default: 'Profiles' },
        unit: { type: String, default: 'bars' },
        // 1-based absolute coordinates on the material tab.
        headerRow: { type: Number },
        snoCol: { type: Number },
        descCol: { type: Number },
        qtyCol: { type: Number },
        dataStartRow: { type: Number },
        dataEndRow: { type: Number },
        enabled: { type: Boolean, default: true }
      }],

      /**
       * Glass panes, read from the CALCULATION tab rather than the material tab -
       * glassList needs per-pane width/height, which the material grid does not
       * contain at all.
       *
       * Disabled by default on purpose. A detector looking for Width/Height
       * headers finds the customer INPUT columns on sheets that have no glass
       * block, and would emit nonsense panes. An empty glass list is far
       * cheaper to live with than a wrong one, so this requires a human tick.
       */
      glassBlock: {
        enabled: { type: Boolean, default: false },
        widthCol: { type: Number },
        heightCol: { type: Number },
        nosCol: { type: Number },
        dataStartRow: { type: Number },
        dataEndRow: { type: Number },
        glassType: { type: String, default: 'Glass Unit' }
      }
    },

    /**
     * Default print page setup (like Microsoft Excel's Page Setup & Multi-Page Print Areas).
     * Defines Page 1, Page 2, Page 3, ... with designated sheet tab, cell range (e.g. A1:E15, A16:E30),
     * orientation, scaling and header toggles for 1-click shopfloor production card printing.
     */
    defaultPrintPages: [{
      pageNumber: { type: Number },
      title: { type: String, default: '' },
      sheetName: { type: String, default: '' },
      range: { type: String, default: '' }, // e.g. "A1:E15"
      orientation: { type: String, enum: ['landscape', 'portrait'], default: 'landscape' },
      scaling: { type: String, default: 'fit-page' },
      showGridlines: { type: Boolean, default: true },
      showHeaders: { type: Boolean, default: true },
      includeMasterCard: { type: Boolean, default: false },
      includeHeader: { type: Boolean, default: true }
    }],

    /**
     * Custom cell typography and formatting overrides (font size, bold, italic, color, fill, align)
     * Saved per sheet tab: { [sheetName]: { [cellAddr]: { bold, italic, fontSize, color, backgroundColor, align } } }
     */
    customCellStyles: { type: mongoose.Schema.Types.Mixed, default: {} }
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

TemplateSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

export default mongoose.model('Template', TemplateSchema);
