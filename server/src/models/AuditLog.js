// src/models/AuditLog.js
const mongoose = require('mongoose');
const auditLogSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true, index: true },
  action: { type: String, enum: ['lock_account', 'unlock_account', 'delete_account'], required: true },
  targetAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
  timestamp: { type: Date, default: Date.now },
});
module.exports = mongoose.model('AuditLog', auditLogSchema);
