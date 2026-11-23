import type { Types } from "mongoose";
import type Note from "../models/Note.ts";
import { generateEmbedding } from "./embedding.service.ts";
import { recordUsage } from "./usage.service.ts";

export async function embedNewNote(
  note: InstanceType<typeof Note>,
  accountId: Types.ObjectId,
  content: string,
) {
  try {
    await recordUsage(accountId, "noteEmbeddingRequests");
    const embedding = await generateEmbedding(content);
    if (embedding) {
      note.embedding = embedding;
      note.embeddingStatus = "success";
    } else {
      note.embeddingStatus = "failed";
    }
    await note.save();
  } catch (aiError) {
    note.embeddingStatus = "failed";
    await note.save();
    console.error("AI embedding failed but note saved:", aiError);
  }
}
