const { success } = require('../utils/response');

// STUB AdminController - khớp mục 2.2.4.5 và nhóm API 2.6.4

function getAccounts(req, res) {
  return success(res, [
    { id: 'stub-account-id-001', email: 'user1@example.com', role: 'users', status: 'active', createdAt: '2026-06-01T00:00:00Z' },
    { id: 'stub-account-id-002', email: 'user2@example.com', role: 'users', status: 'locked', createdAt: '2026-06-15T00:00:00Z' },
  ]);
}

function lockAccount(req, res) {
  return success(res, { id: req.params.id, status: 'locked' });
}

function unlockAccount(req, res) {
  return success(res, { id: req.params.id, status: 'active' });
}

function deleteAccount(req, res) {
  return success(res, { id: req.params.id, deleted: true });
}

function getAuditLog(req, res) {
  return success(res, [
    {
      id: 'audit-001',
      adminId: req.user.id,
      action: 'lock_account',
      targetAccountId: 'stub-account-id-002',
      timestamp: new Date().toISOString(),
    },
  ]);
}

function getStats(req, res) {
  return success(res, {
    totalAccounts: 42,
    totalNotes: 342,
    totalSearches: 128,
    aiEmbeddingCallsThisMonth: 470,
  });
}

function configureAIProvider(req, res) {
  return success(res, { provider: req.body?.provider || 'openai', updatedAt: new Date().toISOString() });
}

module.exports = {
  getAccounts,
  lockAccount,
  unlockAccount,
  deleteAccount,
  getAuditLog,
  getStats,
  configureAIProvider,
};
