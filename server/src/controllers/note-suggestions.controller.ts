import type { RequestHandler } from "express";
import { env } from "../config/env.ts";
import Collection from "../models/Collection.ts";
import Tag from "../models/Tag.ts";
import {
  readSuggestionDraft,
  suggestNoteMetadata,
} from "../services/note-suggestions.service.ts";
import { incrementUsage } from "../services/usage.service.ts";

const candidateLimit = 40;
const candidateNameLimit = 80;

export const suggestNoteOrganization: RequestHandler = async (req, res) => {
  const draft = readSuggestionDraft(req.body);
  if (!draft) {
    res
      .status(400)
      .json({ message: "Provide a draft title string and non-empty content." });
    return;
  }

  const userId = req.user!.id;
  let deadline: AbortSignal | undefined;
  try {
    const [tags, collections] = await Promise.all([
      Tag.find({ userId })
        .sort({ name: 1 })
        .limit(candidateLimit)
        .select("name")
        .lean(),
      Collection.find({ userId })
        .sort({ name: 1 })
        .limit(candidateLimit)
        .select("name")
        .lean(),
    ]);
    const candidates = collections
      .filter(({ name }) => name.length <= candidateNameLimit)
      .map(({ _id, name }) => ({ id: _id.toString(), name }));
    await incrementUsage(userId, "noteSuggestionRequests");
    deadline = AbortSignal.timeout(env.GEMINI_SUGGESTION_TIMEOUT_MS);
    const suggestions = await suggestNoteMetadata(
      draft,
      tags
        .map(({ name }) => name)
        .filter((name) => name.length <= candidateNameLimit),
      candidates,
      deadline,
    );
    const selected = suggestions.collection
      ? await Collection.findOne({ _id: suggestions.collection.id, userId })
          .select("name")
          .lean()
      : null;
    res.json({
      tags: suggestions.tags,
      collection: selected
        ? { id: selected._id.toString(), name: selected.name }
        : null,
    });
  } catch {
    res.status(deadline?.aborted ? 504 : 503).json({
      message: deadline?.aborted
        ? "Suggestions timed out. Try again when ready."
        : "Suggestions are temporarily unavailable. Try again when ready.",
    });
  }
};
