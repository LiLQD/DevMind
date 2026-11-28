import type { Request, RequestHandler } from "express";
import { isObjectIdOrHexString, mongo } from "mongoose";
import type { Types } from "mongoose";
import Tag from "../models/Tag.ts";
import Note from "../models/Note.ts";
import {
  embedNewNote,
  embedNoteRevision,
} from "../services/note-embedding.service.ts";
import {
  invalidNoteCollections,
  noteMetadataPopulation,
  noteResponseProjection,
  resolveNoteCollections,
} from "../services/note-collections.service.ts";
import {
  formatNoteCursor,
  parseNoteCursor,
  readNotePage,
} from "../services/note-pagination.ts";
import { cosineSimilarity } from "../services/embedding.service.ts";

type NoteBody = {
  title?: string;
  content?: string;
  tags?: unknown[] | null;
  collections?: unknown;
  collection?: unknown;
};
type NoteFilters = {
  favorite?: string;
  tagId?: string;
  collectionId?: string;
  page?: string;
  cursor?: string;
};
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
  if (!unique.length) return [];
  await Tag.init();
  const ids = [];
  for (const name of unique) {
    const identity = { name, userId };
    try {
      const tag = await Tag.findOneAndUpdate(
        identity,
        { $setOnInsert: identity },
        { upsert: true, returnDocument: "after", requireFilter: true },
      ).orFail();
      ids.push(tag._id);
    } catch (error) {
      if (!(error instanceof mongo.MongoServerError) || error.code !== 11000) {
        throw error;
      }
      // A concurrent insert may already have created this account's tag.
      const winner = await Tag.exists(identity);
      if (!winner) throw error;
      ids.push(winner._id);
    }
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

    const current = await embedNewNote(note);
    if (current) {
      return res
        .status(201)
        .json(await current.populate(noteMetadataPopulation(userId)));
    }

    // A concurrent delete does not undo the committed create.
    const { contentRevision: _contentRevision, ...snapshot } = (
      await note.populate(noteMetadataPopulation(userId))
    ).toObject();
    res.status(201).json(snapshot);
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
    const { tagId, collectionId, favorite, page, cursor } = req.query;
    const favoritesOnly = favorite === "true";
    const paginated = page === "true" && !favoritesOnly;
    const boundary = cursor === undefined ? undefined : parseNoteCursor(cursor);
    if (cursor !== undefined && (!paginated || !boundary)) {
      return res.status(400).json({ message: "Invalid note cursor." });
    }
    const empty = paginated ? { notes: [], nextCursor: null } : [];
    const userId = req.user!.id;
    if (
      collectionId !== undefined &&
      (await resolveNoteCollections(
        { collections: [collectionId] },
        userId,
      )) === null
    ) {
      return res.json(empty);
    }
    if (
      tagId !== undefined &&
      (!isObjectIdOrHexString(tagId) ||
        !(await Tag.exists({ _id: tagId, userId })))
    ) {
      return res.json(empty);
    }
    const query = {
      userId,
      ...(tagId ? { tags: tagId } : {}),
      ...(favoritesOnly ? { favoritedAt: { $type: "date" as const } } : {}),
      ...(collectionId ? { collections: collectionId } : {}),
    };

    const list = (range?: {
      createdAt: Date | null | { $lt: Date };
      _id?: { $lt: string };
    }) =>
      Note.find({ ...query, ...range })
        .select(`${noteResponseProjection} -embedding`)
        // oxlint-disable-next-line unicorn/no-array-sort -- Mongoose query ordering.
        .sort(
          favoritesOnly
            ? { favoritedAt: -1, _id: -1 }
            : { createdAt: -1, _id: -1 },
        );

    if (!paginated) {
      return res.json(await list().populate(noteMetadataPopulation(userId)));
    }

    const { notes, hasMore } = await readNotePage(
      boundary,
      (limit, timestamp, idBefore) =>
        list(
          timestamp === undefined
            ? undefined
            : {
                createdAt: timestamp,
                ...(idBefore ? { _id: { $lt: idBefore } } : {}),
              },
        ).limit(limit),
    );
    await Note.populate(notes, noteMetadataPopulation(userId));
    const last = notes.at(-1);
    res.json({
      notes,
      nextCursor:
        hasMore && last ? formatNoteCursor(last.createdAt, last.id) : null,
    });
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
      const candidates = await Note.find({
        userId,
        _id: { $ne: note._id },
        embeddingStatus: "success",
      })
        .select("_id embedding")
        .lean();

      const THRESHOLD = 0.65;
      const ranked = candidates
        .map((candidate) => ({
          id: candidate._id,
          similarityScore: cosineSimilarity(
            note.embedding,
            candidate.embedding,
          ),
        }))
        .filter((item) => item.similarityScore >= THRESHOLD)
        .toSorted((a, b) => b.similarityScore - a.similarityScore)
        .slice(0, 5);

      if (ranked.length) {
        const winners = await Note.find({
          _id: { $in: ranked.map(({ id }) => id) },
          userId,
          embeddingStatus: "success",
        })
          .select(noteResponseProjection)
          .populate(noteMetadataPopulation(userId));
        const winnersById = new Map(
          winners.map((winner) => [winner.id, winner]),
        );

        for (const { id, similarityScore } of ranked) {
          const winner = winnersById.get(id.toString());
          // A candidate can change between ranking and hydration.
          if (
            winner &&
            cosineSimilarity(note.embedding, winner.embedding) ===
              similarityScore
          ) {
            relatedNotes.push({ ...winner.toObject(), similarityScore });
          }
        }
      }
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
    const note = await Note.findById(req.params.id).select("userId");

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

    const filter = { _id: note._id, userId };
    const metadata = {
      ...(title ? { title } : {}),
      ...(tags ? { tags: await resolveTagIds(tags, userId) } : {}),
      ...(collections !== undefined ? { collections } : {}),
    };
    const hasMetadata = Object.keys(metadata).length > 0;
    const options = { returnDocument: "after", runValidators: true } as const;

    if (content) {
      for (;;) {
        const changed = await Note.findOneAndUpdate(
          { ...filter, content: { $ne: content } },
          {
            $set: { ...metadata, content, embeddingStatus: "pending" },
            $inc: { contentRevision: 1 },
          },
          options,
        ).select("content userId +contentRevision");
        if (changed) {
          await embedNoteRevision(changed);
          break;
        }

        const unchanged = hasMetadata
          ? await Note.findOneAndUpdate(
              { ...filter, content },
              { $set: metadata },
              options,
            ).select("_id")
          : await Note.findOne({ ...filter, content }).select("_id");
        if (unchanged || !(await Note.findOne(filter).select("_id"))) break;
        // Neither predicate wrote anything. Recheck after the concurrent edit.
      }
    } else if (hasMetadata) {
      await Note.findOneAndUpdate(filter, { $set: metadata }, options).select(
        "_id",
      );
    }

    const current = await Note.findOne(filter)
      .select(noteResponseProjection)
      .populate(noteMetadataPopulation(userId));
    if (!current) {
      return res.status(404).json({ message: "Không tìm thấy ghi chú" });
    }
    res.json(current);
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
