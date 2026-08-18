// src/models/Note.js
const mongoose = require('mongoose');
const noteSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true, index: true },
  collectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Collection' },
  title: { type: String, required: true, maxlength: 200 },
  content: { type: String, required: true },
  type: { type: String, enum: ['snippet', 'note'], default: 'note' },
  tagIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tag' }],
  embedding: { type: [Number], default: null },
  embeddingStatus: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending' },
}, { timestamps: true });
module.exports = mongoose.model('Note', noteSchema);
