import express from 'express';
import { protect, staff } from '../middleware/auth.middleware.js';

const router = express.Router();

// All staff routes require authentication and staff role
router.use(protect);
router.use(staff);

// Get user details
router.get('/users/:id', (req, res) => {
  // TODO: Implement
  res.json({ message: 'Staff - Get user details' });
});

// Handle support requests
router.post('/support', (req, res) => {
  // TODO: Implement
  res.json({ message: 'Staff - Handle support' });
});

// Moderate content
router.post('/moderate/:id', (req, res) => {
  // TODO: Implement
  res.json({ message: 'Staff - Moderate content' });
});

export default router;
