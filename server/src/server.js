import { webcrypto } from 'node:crypto';

// Ensure the global WebCrypto API is available before mongoose/mongodb
// attempt to use it during the SCRAM-SHA-256 auth handshake.
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

import dotenv from 'dotenv';
import app from './app.js';
import mongoose from 'mongoose';

dotenv.config();

const PORT = process.env.PORT || 8080;

console.log('Starting DevMind server...');
console.log(`PORT: ${PORT}`);

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected');
    
    // Start the server
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Health: http://localhost:${PORT}/api/health`);
    });
    
    // Handle server errors
    server.on('error', (error) => {
      console.error('Server error:', error);
      process.exit(1);
    });
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  });

// Handle process termination
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});
