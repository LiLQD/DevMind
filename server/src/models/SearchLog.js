// src/models/SearchLog.js
const mongoose = require('mongoose');
const searchLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true, index: true },
  queryText: { type: String, required: true },
  resultNoteIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Note' }],
  resultScores: [Number],
}, { timestamps: { createdAt: true, updatedAt: false } });
module.exports = mongoose.model('SearchLog', searchLogSchema);
