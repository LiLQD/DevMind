import mongoose from 'mongoose';

const noteSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    maxlength: 200
  },
  content: {
    type: String,
    required: true
  },
  embedding: {
    type: [Number],
    default: null
  },
  embeddingStatus: {
    type: String,
    enum: ['success', 'failed', 'pending'],
    default: 'pending'
  },
  tags: {
    type: [String],
    default: []
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, { timestamps: true });

export default mongoose.model('Note', noteSchema);
