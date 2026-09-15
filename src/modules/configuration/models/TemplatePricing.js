import mongoose from 'mongoose';

const TemplatePricingSchema = new mongoose.Schema({
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template', required: true },
  materialCost: { type: String, default: '0' },
  glassCost: { type: String, default: '0' },
  hardwareCost: { type: String, default: '0' },
  laborCost: { type: String, default: '0' },
  installationCost: { type: String, default: '0' },
  transportCost: { type: String, default: '0' },
  margin: { type: String, default: '20' },
  dealerMargin: { type: String, default: '15' },
  retailMargin: { type: String, default: '25' },
  projectMargin: { type: String, default: '10' },
  gst: { type: String, default: '18' },
  sellingPriceFormula: { type: String, default: '(MaterialCost + GlassCost + HardwareCost + LaborCost + InstallationCost + TransportCost) * (1 + Margin/100)' }
});

export default mongoose.model('TemplatePricing', TemplatePricingSchema);
