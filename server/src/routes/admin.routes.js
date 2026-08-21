import express from 'express';
import { protect, admin } from '../middleware/auth.middleware.js';

const router = express.Router();

// All admin routes require authentication and admin role
router.use(protect);
router.use(admin);

// Get all users
router.get('/users', (req, res) => {
  // TODO: Implement
  res.json({ message: 'Admin - Get all users' });
});

// Lock user account
router.put('/users/:id/lock', (req, res) => {
  // TODO: Implement
  res.json({ message: 'Admin - Lock user' });
});

// Unlock user account
router.put('/users/:id/unlock', (req, res) => {
  // TODO: Implement
  res.json({ message: 'Admin - Unlock user' });
});

// Delete user
router.delete('/users/:id', (req, res) => {
  // TODO: Implement
  res.json({ message: 'Admin - Delete user' });
});

// Get audit logs
router.get('/audit-logs', (req, res) => {
  // TODO: Implement
  res.json({ message: 'Admin - Get audit logs' });
});

// Get system stats
router.get('/stats', (req, res) => {
  // TODO: Implement
  res.json({ message: 'Admin - Get stats' });
});

export default router;
