const { success, fail } = require('../utils/response');

// STUB StaffController - khớp mục 2.2.4.6 và nhóm API 2.6.5
// Lưu ý phạm vi triển khai đã ghi ở mục 2.6.5: nhóm này có thể chỉ demo
// bằng dữ liệu giả lập, không bắt buộc có luồng người dùng tạo dữ liệu đầu vào thật.

function getAccountInfo(req, res) {
  return success(res, { id: req.params.id, email: 'user1@example.com', role: 'users', status: 'active' });
}

function getTickets(req, res) {
  return success(res, [{ id: 'ticket-001', subject: 'Không đăng nhập được', status: 'open' }]);
}

function updateTicket(req, res) {
  return success(res, { id: req.params.id, status: req.body?.status || 'resolved' });
}

function getModerationQueue(req, res) {
  return success(res, [{ id: 'note-shared-001', title: 'Custom hook useDebounce', ownerId: 'stub-account-id-001', status: 'pending' }]);
}

function approveContent(req, res) {
  return success(res, { id: req.params.id, status: 'approved' });
}

function rejectContent(req, res) {
  const { reason } = req.body || {};
  if (!reason) return fail(res, 'VALIDATION_ERROR', 'Cần nhập lý do từ chối', 422);
  return success(res, { id: req.params.id, status: 'rejected', reason });
}

module.exports = {
  getAccountInfo,
  getTickets,
  updateTicket,
  getModerationQueue,
  approveContent,
  rejectContent,
};
