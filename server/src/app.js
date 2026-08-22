import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';

import authRoutes from './routes/auth.routes.js';
import noteRoutes from './routes/notes.routes.js';
import adminRoutes from './routes/admin.routes.js';
import staffRoutes from './routes/staff.routes.js';

import { generalLimiter, searchLimiter } from './middleware/rateLimiter.js';

dotenv.config();

console.log('Configuring Express app...');

const app = express();
app.set('trust proxy', true);

// Middleware
app.use(cors());
app.use(express.json());

// Logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Rate limiting
app.use('/api', generalLimiter);
app.use('/api/notes/search', searchLimiter);
app.use('/api/notes/:id/related', searchLimiter);

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'DevMind API v1.0',
    status: 'running',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth/register',
      login: '/api/auth/login',
      notes: '/api/notes'
    }
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'DevMind API running',
    timestamp: new Date().toISOString()
  });
});

// API Routes
console.log('Mounting routes...');
app.use('/api/auth', authRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/staff', staffRoutes);
console.log('Routes mounted');

// 404 handler
app.use((req, res) => {
  console.log(`404: ${req.method} ${req.url}`);
  res.status(404).json({ 
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Không tìm thấy endpoint ${req.method} ${req.url}`
    }
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: err.message || 'Internal server error'
    }
  });
});

console.log('App configured');

export default app;
