import Note from "../models/Note.ts";
import { generateEmbedding } from "./embedding.service.ts";
import { recordUsage } from "./usage.service.ts";

type EmbeddingInput = Pick<
  InstanceType<typeof Note>,
  "_id" | "userId" | "content" | "contentRevision"
>;

export async function embedNoteRevision(note: EmbeddingInput) {
  const { _id, userId, content, contentRevision } = note;
  await recordUsage(userId, "noteEmbeddingRequests");
  let embedding: number[] | null = null;
  try {
    embedding = await generateEmbedding(content);
  } catch (error) {
    console.error("AI embedding failed but note saved:", error);
  }

  // A newer edit or a delete can legitimately leave this write with no match.
  await Note.updateOne(
    { _id, userId, contentRevision },
    {
      $set: embedding
        ? { embedding, embeddingStatus: "success" }
        : { embeddingStatus: "failed" },
    },
    { timestamps: false },
  );
}

export async function embedNewNote(note: EmbeddingInput) {
  await embedNoteRevision(note);
  return Note.findOne({ _id: note._id, userId: note.userId });
}
