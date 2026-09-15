import mongoose from 'mongoose';

const InstallationTeamSchema = new mongoose.Schema({
  teamName: { type: String, required: true, unique: true },
  members: [{ type: String }],
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' }
}, { timestamps: true });

export default mongoose.model('InstallationTeam', InstallationTeamSchema);
