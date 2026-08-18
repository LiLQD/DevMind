const express = require('express');
const adminController = require('../controllers/admin.controller');
const { requireAuth, requireRole } = require('../middleware/auth.middleware');

const router = express.Router();
// Router này được mount với tiền tố "/admin" ở app.js (app.use('/admin', adminRoutes))
// nên router.use() ở đây CHỈ áp dụng cho các request bắt đầu bằng /admin, không rò
// sang các route khác - khác với cách làm cũ (mount ở root) từng gây lỗi 403 nhầm
// cho cả những đường dẫn không tồn tại.
router.use(requireAuth, requireRole('administrator'));

router.get('/accounts', adminController.getAccounts);
router.put('/accounts/:id/lock', adminController.lockAccount);
router.put('/accounts/:id/unlock', adminController.unlockAccount);
router.delete('/accounts/:id', adminController.deleteAccount);
router.get('/audit-log', adminController.getAuditLog);
router.get('/stats', adminController.getStats);
router.put('/ai-provider-config', adminController.configureAIProvider);

module.exports = router;
