// src/models/Tag.js
const mongoose = require('mongoose');
const tagSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true, index: true },
  name: { type: String, required: true },
  color: { type: String, default: '#6366f1' },
  source: { type: String, enum: ['manual', 'ai_suggested'], default: 'manual' },
}, { timestamps: { createdAt: true, updatedAt: false } });
tagSchema.index({ userId: 1, name: 1 }, { unique: true });
module.exports = mongoose.model('Tag', tagSchema);
