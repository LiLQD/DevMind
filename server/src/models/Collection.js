import mongoose from 'mongoose';

const collectionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: true
  }
}, { timestamps: true });

collectionSchema.index({ userId: 1, name: 1 }, { unique: true });

const Collection = mongoose.model('Collection', collectionSchema);
export default Collection;
