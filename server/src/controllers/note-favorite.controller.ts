import type { RequestHandler } from "express";
import { isObjectIdOrHexString } from "mongoose";
import Note from "../models/Note.ts";

export const setNoteFavorite: RequestHandler<{ id: string }> = async (
  req,
  res,
) => {
  const body: unknown = req.body;
  if (
    !isObjectIdOrHexString(req.params.id) ||
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    !("favorite" in body) ||
    typeof body.favorite !== "boolean" ||
    Object.keys(body).length !== 1
  ) {
    res.status(400).json({
      message: "Provide a valid note ID and a boolean favorite value.",
    });
    return;
  }

  // The conditional update keeps the first star timestamp even for concurrent retries.
  const note = await Note.findOneAndUpdate(
    { _id: req.params.id, userId: req.user!.id },
    body.favorite
      ? [{ $set: { favoritedAt: { $ifNull: ["$favoritedAt", "$$NOW"] } } }]
      : [{ $unset: "favoritedAt" }],
    { returnDocument: "after", timestamps: false, updatePipeline: true },
  )
    .select("favoritedAt")
    .lean();
  if (!note) {
    res.status(404).json({ message: "Note not found." });
    return;
  }
  res.json({ favoritedAt: note.favoritedAt ?? null });
};
