// src/models/Account.js
const mongoose = require('mongoose');
const accountSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['users', 'staff', 'administrator'], default: 'users', required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });
module.exports = mongoose.model('Account', accountSchema);
