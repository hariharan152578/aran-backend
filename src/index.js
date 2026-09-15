import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import authRoutes from './routes/auth.js';

dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();
const server = http.createServer(app);

// Socket.IO Setup
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => callback(null, true),
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Middleware
app.use(cors({
  origin: (origin, callback) => callback(null, true),
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);

// Register manufacturing modules dynamically
const modules = [
  'crm', 'configuration', 'sales', 'production',
  'dispatch', 'installation',
  'service', 'accounts', 'reports', 'admin',
  'sheets'
];

for (const mod of modules) {
  try {
    const { default: router } = await import(`./modules/${mod}/router.js`);
    app.use(`/api/${mod}`, router);
  } catch (err) {
    console.warn(`[WARN] Skipping module ${mod} - Router not found.`);
  }
}

// Ping Route
app.get('/api/ping', (req, res) => {
  res.json({ message: 'Aran ERP Server is running!', timestamp: new Date() });
});

// Socket Connections
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Ping-pong for latency tests
  socket.on('ping', (callback) => {
    if (typeof callback === 'function') callback();
  });

  // Relay real-time production stage updates to client tracking dashboards
  socket.on('update-stage', (data) => {
    console.log('Production Stage Update:', data);
    io.emit('stage-updated', data);
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});
// Trigger nodemon restart comment 2
