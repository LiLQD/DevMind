import mongoose from 'mongoose';

const searchLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: true
  },
  query: {
    type: String,
    required: true
  },
  results: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Note'
  }],
  resultCount: {
    type: Number,
    default: 0
  },
  topScores: {
    type: [Number],
    default: []
  }
}, { timestamps: true });

searchLogSchema.index({ userId: 1, createdAt: -1 });

const SearchLog = mongoose.model('SearchLog', searchLogSchema);
export default SearchLog;
