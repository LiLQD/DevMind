import { createHash } from "node:crypto";
import type { RequestHandler } from "express";
import type { Types } from "mongoose";
import Note from "../models/Note.ts";
import { embedNewNote } from "../services/note-embedding.service.ts";
import { getAccountSubscription } from "../services/subscription.service.ts";

const maxNotes = 5;
const importKeyPattern = /^[a-zA-Z0-9_-]{1,100}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseItem(item: unknown) {
  if (
    !isRecord(item) ||
    typeof item.key !== "string" ||
    !importKeyPattern.test(item.key) ||
    typeof item.title !== "string" ||
    typeof item.content !== "string"
  ) {
    return null;
  }
  const title = item.title.trim();
  const content = item.content.trim();
  if (!title || title.length > 200 || !content) return null;
  return { key: item.key, title, content };
}

async function importItem(
  userId: Types.ObjectId,
  item: NonNullable<ReturnType<typeof parseItem>>,
) {
  const { key, title, content } = item;
  const importFingerprint = createHash("sha256")
    .update(JSON.stringify([title, content]))
    .digest("hex");
  const saved = (note: InstanceType<typeof Note>) => ({
    status: "saved",
    noteId: note._id.toString(),
    embeddingStatus: note.embeddingStatus,
  });
  const note = new Note({
    userId,
    title,
    content,
    importKey: key,
    importFingerprint,
  });
  try {
    await note.save();
  } catch (error) {
    if (
      typeof error !== "object" ||
      error === null ||
      !("code" in error) ||
      error.code !== 11000
    )
      throw error;

    const existing = await Note.findOne({ userId, importKey: key }).select(
      "+importFingerprint",
    );
    if (!existing) throw error;
    if (existing.importFingerprint !== importFingerprint) {
      return { status: "failed", code: "IMPORT_KEY_CONFLICT" };
    }
    return saved(existing);
  }

  try {
    await embedNewNote(note, userId, content);
    return saved(note);
  } catch {
    // The note insert succeeded. A retry must preserve it and avoid another Gemini attempt.
    console.error(
      "Could not store the imported note embedding:",
      note._id.toString(),
    );
    return { ...saved(note), embeddingStatus: "pending" };
  }
}

export const bulkImportNotes: RequestHandler = async (req, res) => {
  const userId = req.user!.id;
  let allowed: boolean;
  try {
    const subscription = await getAccountSubscription(userId);
    allowed = subscription.entitlements.bulkMarkdownImport;
  } catch {
    res
      .status(503)
      .json({ message: "Bulk import is temporarily unavailable." });
    return;
  }
  if (!allowed) {
    res.status(403).json({ message: "Bulk Markdown import requires Pro." });
    return;
  }

  const body: unknown = req.body;
  if (
    !isRecord(body) ||
    !Array.isArray(body.notes) ||
    !body.notes.length ||
    body.notes.length > maxNotes
  ) {
    res
      .status(400)
      .json({ message: `Provide between 1 and ${maxNotes} notes.` });
    return;
  }

  // Await the unique index before accepting concurrent import retries.
  await Note.init();
  const results = [];
  for (const [index, raw] of body.notes.entries()) {
    const item = parseItem(raw);
    if (!item) {
      results.push({ index, status: "failed", code: "INVALID_NOTE" });
      continue;
    }
    try {
      results.push({
        index,
        key: item.key,
        ...(await importItem(userId, item)),
      });
    } catch {
      console.error("Could not save a bulk import item.");
      results.push({
        index,
        key: item.key,
        status: "failed",
        code: "SAVE_FAILED",
      });
    }
  }
  res.set("Cache-Control", "no-store").json({ results });
};
