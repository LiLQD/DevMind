const express = require('express');
const staffController = require('../controllers/staff.controller');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');

const router = express.Router();
// Mount với tiền tố "/staff" ở app.js - lý do giống admin.routes.js
router.use(requireAuth, requireRole('staff', 'administrator'));

router.get('/accounts/:id', staffController.getAccountInfo);
router.get('/tickets', staffController.getTickets);
router.put('/tickets/:id', staffController.updateTicket);
router.get('/moderation-queue', staffController.getModerationQueue);
router.put('/moderation-queue/:id/approve', staffController.approveContent);
router.put('/moderation-queue/:id/reject', staffController.rejectContent);

module.exports = router;
