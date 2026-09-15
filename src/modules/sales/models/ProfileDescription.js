import mongoose from 'mongoose';

const ProfileDescriptionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Profile description name is required'],
    trim: true,
    unique: true
  }
}, {
  timestamps: true
});

export default mongoose.model('ProfileDescription', ProfileDescriptionSchema);
