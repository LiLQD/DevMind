// src/models/Collection.js
const mongoose = require('mongoose');
const collectionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true, index: true },
  name: { type: String, required: true, maxlength: 100 },
  description: String,
}, { timestamps: { createdAt: true, updatedAt: false } });
module.exports = mongoose.model('Collection', collectionSchema);
