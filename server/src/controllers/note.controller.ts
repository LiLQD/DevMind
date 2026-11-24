import type { Request, RequestHandler } from "express";
import type { Types } from "mongoose";
import Tag from "../models/Tag.ts";
import Note from "../models/Note.ts";
import { embedNewNote } from "../services/note-embedding.service.ts";
import {
  invalidNoteCollections,
  noteMetadataPopulation,
  noteResponseProjection,
  resolveNoteCollections,
} from "../services/note-collections.service.ts";
import { recordUsage } from "../services/usage.service.ts";
import {
  generateEmbedding,
  cosineSimilarity,
} from "../services/embedding.service.ts";

type NoteBody = {
  title?: string;
  content?: string;
  tags?: unknown[] | null;
  collections?: unknown;
  collection?: unknown;
};
type NoteFilters = { tagId?: string; collectionId?: string };
type NoteParams = { id: string };
type RouteParams = Request["params"];

// Resolve tag names to ObjectIds, creating missing tags for this user.
const resolveTagIds = async (
  names: NoteBody["tags"],
  userId: Types.ObjectId,
) => {
  const unique = [
    ...new Set((names || []).map((n) => String(n).trim()).filter(Boolean)),
  ];
  const ids = [];
  for (const name of unique) {
    const tag = await Tag.findOneAndUpdate(
      { name, userId },
      { $setOnInsert: { name, userId } },
      { upsert: true, returnDocument: "after" },
    );
    ids.push(tag!._id);
  }
  return ids;
};

// Create note
export const createNote: RequestHandler<
  RouteParams,
  unknown,
  NoteBody
> = async (req, res) => {
  try {
    const { title, content, tags } = req.body;

    if (!title || !content) {
      return res.status(400).json({ message: "Thiếu title hoặc content" });
    }

    if (title.length > 200) {
      return res.status(400).json({ message: "Tiêu đề vượt quá 200 ký tự" });
    }

    const userId = req.user!.id;
    const collections = await resolveNoteCollections(req.body, userId);
    if (collections === null) {
      return res.status(400).json(invalidNoteCollections);
    }

    const note = new Note({
      title,
      content,
      userId,
      embeddingStatus: "pending",
      tags: await resolveTagIds(tags, userId),
      collections: collections ?? [],
    });

    await note.save();

    await embedNewNote(note, userId, content);

    const populatedNote = await note.populate(noteMetadataPopulation(userId));
    res.status(201).json(populatedNote);
  } catch (error) {
    console.error("Create note error:", error);
    res.status(500).json({ message: "Tạo ghi chú thất bại" });
  }
};

// Get all notes
export const getNotes: RequestHandler<
  RouteParams,
  unknown,
  unknown,
  NoteFilters
> = async (req, res) => {
  try {
    const { tagId, collectionId } = req.query;
    const userId = req.user!.id;
    if (
      collectionId !== undefined &&
      (await resolveNoteCollections(
        { collections: [collectionId] },
        userId,
      )) === null
    ) {
      return res.json([]);
    }
    const query = {
      userId,
      ...(tagId ? { tags: tagId } : {}),
      ...(collectionId ? { collections: collectionId } : {}),
    };

    const notes = await Note.find(query)
      .select(noteResponseProjection)
      .populate(noteMetadataPopulation(userId))
      .sort({ createdAt: -1 });

    res.json(notes);
  } catch (error) {
    console.error("Get notes error:", error);
    res.status(500).json({ message: "Lỗi lấy danh sách ghi chú" });
  }
};

// Get single note with related suggestions
export const getNote: RequestHandler<NoteParams> = async (req, res) => {
  try {
    const userId = req.user!.id;
    const note = await Note.findById(req.params.id).select(
      noteResponseProjection,
    );

    if (!note) {
      return res.status(404).json({ message: "Không tìm thấy ghi chú" });
    }

    if (note.userId.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Không có quyền truy cập" });
    }
    await note.populate(noteMetadataPopulation(userId));

    // Get related notes if embedding exists
    const relatedNotes = [];
    if (note.embeddingStatus === "success" && note.embedding) {
      const otherNotes = await Note.find({
        userId,
        _id: { $ne: note._id },
        embeddingStatus: "success",
      })
        .select(noteResponseProjection)
        .populate(noteMetadataPopulation(userId));

      const scored = otherNotes.map((n) => ({
        ...n.toObject(),
        similarityScore: cosineSimilarity(note.embedding, n.embedding),
      }));

      const THRESHOLD = 0.65;
      const filtered = scored
        .filter((item) => item.similarityScore >= THRESHOLD)
        .toSorted((a, b) => b.similarityScore - a.similarityScore);

      // Deduplicate by _id (keep highest score)
      const seen = new Set();
      const deduped = [];
      for (const item of filtered) {
        if (!seen.has(item._id)) {
          seen.add(item._id);
          deduped.push(item);
        }
      }

      relatedNotes.push(...deduped.slice(0, 5));
    }

    res.json({
      ...note.toObject(),
      relatedNotes,
    });
  } catch (error) {
    console.error("Get note error:", error);
    res.status(500).json({ message: "Lỗi lấy ghi chú" });
  }
};

// Update note
export const updateNote: RequestHandler<NoteParams, unknown, NoteBody> = async (
  req,
  res,
) => {
  try {
    const { title, content, tags } = req.body;
    const userId = req.user!.id;
    const note = await Note.findById(req.params.id).select(
      noteResponseProjection,
    );

    if (!note) {
      return res.status(404).json({ message: "Không tìm thấy ghi chú" });
    }

    if (note.userId.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Không có quyền" });
    }

    const collections = await resolveNoteCollections(req.body, userId);
    if (collections === null) {
      return res.status(400).json(invalidNoteCollections);
    }

    const contentChanged = content && content !== note.content;
    if (title) note.title = title;
    if (content) note.content = content;
    if (tags) note.tags = await resolveTagIds(tags, userId);
    if (collections !== undefined) note.collections = collections;

    if (contentChanged) {
      note.embeddingStatus = "pending";
      try {
        await recordUsage(userId, "noteEmbeddingRequests");
        const embedding = await generateEmbedding(content);
        if (embedding) {
          note.embedding = embedding;
          note.embeddingStatus = "success";
        } else {
          note.embeddingStatus = "failed";
        }
      } catch {
        note.embeddingStatus = "failed";
      }
    }

    await note.save();
    const populatedNote = await note.populate(noteMetadataPopulation(userId));
    res.json(populatedNote);
  } catch (error) {
    console.error("Update note error:", error);
    res.status(500).json({ message: "Cập nhật thất bại" });
  }
};

// Delete note
export const deleteNote: RequestHandler<NoteParams> = async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);

    if (!note) {
      return res.status(404).json({ message: "Không tìm thấy ghi chú" });
    }

    if (note.userId.toString() !== req.user!.id.toString()) {
      return res.status(403).json({ message: "Không có quyền" });
    }

    await note.deleteOne();
    res.json({ message: "Xóa ghi chú thành công" });
  } catch (error) {
    console.error("Delete note error:", error);
    res.status(500).json({ message: "Xóa thất bại" });
  }
};
