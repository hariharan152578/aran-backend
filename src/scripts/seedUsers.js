import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import User from '../models/User.js';

// Resolve directory path for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const DEFAULT_USERS = [
  {
    username: 'admin',
    name: 'System Administrator',
    password: process.env.ADMIN_SEED_PASSWORD || 'password123',
    role: 'Admin',
    isActive: true
  },
  {
    username: 'sales',
    name: 'Sales Executive',
    password: process.env.SALES_SEED_PASSWORD || 'password123',
    role: 'Sales',
    isActive: true
  },
  {
    username: 'prod',
    name: 'Production Supervisor',
    password: process.env.PROD_SEED_PASSWORD || 'password123',
    role: 'Production',
    isActive: true
  },
  {
    username: 'accounts',
    name: 'Accounts Officer',
    password: process.env.ACCOUNTS_SEED_PASSWORD || 'password123',
    role: 'Accounts',
    isActive: true
  },
  {
    username: 'store',
    name: 'Store Keeper',
    password: process.env.STORE_SEED_PASSWORD || 'password123',
    role: 'Store',
    isActive: true
  },
  {
    username: 'install',
    name: 'Installation Lead',
    password: process.env.INSTALL_SEED_PASSWORD || 'password123',
    role: 'Installation',
    isActive: true
  },
  {
    username: 'manager',
    name: 'General Manager',
    password: process.env.MANAGER_SEED_PASSWORD || 'password123',
    role: 'Management',
    isActive: true
  }
];

export const seedUsers = async () => {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/aran_erp';

  console.log('====================================================');
  console.log('       ARAN ERP - LOGIN CREDENTIALS SEEDER          ');
  console.log('====================================================');
  console.log(`Connecting to MongoDB at: ${mongoUri.replace(/:([^:@]{1,})@/, ':****@')} ...`);

  let connection;
  try {
    connection = await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB successfully.\n');

    const summary = [];

    for (const userData of DEFAULT_USERS) {
      const usernameNormalized = userData.username.toLowerCase();
      let user = await User.findOne({ username: usernameNormalized });

      if (!user) {
        user = await User.create({
          username: usernameNormalized,
          password: userData.password,
          name: userData.name,
          role: userData.role,
          isActive: true
        });
        summary.push({
          Username: user.username,
          Role: user.role,
          Name: user.name,
          Status: 'CREATED (password: password123)'
        });
      } else {
        user.name = userData.name;
        user.role = userData.role;
        user.isActive = true;
        // Setting password explicitly triggers the bcrypt hash in the pre-save hook
        user.password = userData.password;
        await user.save();
        summary.push({
          Username: user.username,
          Role: user.role,
          Name: user.name,
          Status: 'RESET / UPDATED (password: password123)'
        });
      }
    }

    console.table(summary);
    console.log('\n[SUCCESS] All login credentials initialized successfully.');
    console.log('You can now log into the web portal with any of the accounts above.\n');
  } catch (error) {
    console.error('\n[ERROR] Failed to seed login credentials:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await mongoose.disconnect();
      console.log('MongoDB connection closed.');
    }
  }
};

// If invoked directly from terminal: node src/scripts/seedUsers.js
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  seedUsers().then(() => process.exit(0)).catch(() => process.exit(1));
}
