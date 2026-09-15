import mongoose from 'mongoose';

const CategorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
  path: { type: String, default: '' },
  description: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Update path on save
CategorySchema.pre('save', async function (next) {
  if (this.isModified('parentId') || this.isNew) {
    if (this.parentId) {
      const parent = await mongoose.model('Category').findById(this.parentId);
      if (parent) {
        this.path = `${parent.path},${this.name}`;
      } else {
        this.path = this.name;
      }
    } else {
      this.path = this.name;
    }
  }
  this.updatedAt = Date.now();
  next();
});

export default mongoose.model('Category', CategorySchema);
