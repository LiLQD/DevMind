import mongoose from "mongoose";

const noteSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    content: {
      type: String,
      required: true,
    },
    importKey: { type: String, select: false },
    importFingerprint: { type: String, select: false },
    embedding: {
      type: [Number],
      default: null,
    },
    embeddingStatus: {
      type: String,
      enum: ["success", "failed", "pending"],
      default: "pending",
    },
    tags: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Tag",
      },
    ],
    collections: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Collection",
      },
    ],
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
  },
  { timestamps: true },
);

noteSchema.index({ userId: 1, embeddingStatus: 1 });
noteSchema.index(
  { userId: 1, importKey: 1 },
  { unique: true, partialFilterExpression: { importKey: { $type: "string" } } },
);

const Note = mongoose.model("Note", noteSchema);
export default Note;
