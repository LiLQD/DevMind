import type { RequestHandler } from "express";
import Note from "../models/Note.ts";
import SearchLog from "../models/SearchLog.ts";
import { monthlySemanticSearchAllowances } from "../config/plans.ts";
import { getAccountSubscription } from "../services/subscription.service.ts";
import { reserveSemanticSearch } from "../services/usage.service.ts";
import {
  noteMetadataPopulation,
  noteResponseProjection,
} from "../services/note-collections.service.ts";
import {
  formatNoteCursor,
  parseNoteCursor,
  readNotePage,
} from "../services/note-pagination.ts";
import {
  generateQueryEmbedding,
  cosineSimilarity,
} from "../services/embedding.service.ts";

function exactExcerpt(content: string, match: RegExp) {
  const hit = match.exec(content);
  if (!hit) return content.length > 160 ? `${content.slice(0, 160)}…` : content;
  const hitEnd = hit.index + hit[0].length;
  const start = Math.max(0, hit.index - 40);
  const end = Math.min(content.length, hitEnd + 60);
  return `${start > 0 ? "…" : ""}${content.slice(start, end)}${end < content.length ? "…" : ""}`;
}

const exactSearch: RequestHandler = async (req, res) => {
  const query: unknown = req.body.query;
  if (typeof query !== "string" || !query.trim() || query.length > 1000) {
    res
      .status(400)
      .json({ message: "Enter a search query of 1–1,000 characters." });
    return;
  }

  const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(escaped, "i");
  const accountId = req.user!.id;
  const paginated = req.body.page === true;
  const cursor: unknown = req.body.cursor;
  const boundary = cursor === undefined ? undefined : parseNoteCursor(cursor);
  if (cursor !== undefined && (!paginated || !boundary)) {
    return res.status(400).json({ message: "Invalid note cursor." });
  }
  const filter = {
    userId: accountId,
    $or: [{ title: match }, { content: match }],
  };
  const list = (range?: {
    updatedAt: Date | null | { $lt: Date };
    _id?: { $lt: string };
  }) =>
    Note.find({ ...filter, ...range })
      .select(`${noteResponseProjection} -embedding`)
      .sort({ updatedAt: -1, _id: -1 });
  if (!paginated) {
    const results = await list().populate(noteMetadataPopulation(accountId));
    return res.json({ results });
  }

  const { notes: page, hasMore } = await readNotePage(
    boundary,
    (limit, timestamp, idBefore) =>
      list(
        timestamp === undefined
          ? undefined
          : {
              updatedAt: timestamp,
              ...(idBefore ? { _id: { $lt: idBefore } } : {}),
            },
      ).limit(limit),
  );
  await Note.populate(page, noteMetadataPopulation(accountId));
  const last = page.at(-1);
  res.json({
    results: page.map((note) => ({
      ...note.toObject(),
      content: exactExcerpt(note.content ?? "", match),
    })),
    nextCursor:
      hasMore && last ? formatNoteCursor(last.updatedAt, last.id) : null,
  });
};

export const searchNotes: RequestHandler = async (req, res, next) => {
  const mode: unknown = req.body?.mode;
  if (mode === "exact") return exactSearch(req, res, next);
  if (mode === undefined || mode === "semantic")
    return semanticSearch(req, res, next);
  res.status(400).json({ message: "Unknown search mode." });
};

const semanticSearch: RequestHandler = async (req, res) => {
  try {
    const { query }: { query?: unknown } = req.body;
    const TOP_K = 5;

    if (!query || (typeof query === "string" && query.trim() === "")) {
      return res.status(400).json({ message: "Vui lòng nhập từ khóa" });
    }
    if (typeof query !== "string") {
      throw new TypeError("Search query must be a string.");
    }

    const accountId = req.user!.id;
    const noteCount = await Note.countDocuments({
      userId: accountId,
      embeddingStatus: "success",
    });

    try {
      const { plan } = await getAccountSubscription(accountId);
      const { allowed, resetAt } = await reserveSemanticSearch(
        accountId,
        monthlySemanticSearchAllowances[plan],
      );
      if (!allowed) {
        return res.status(429).json({
          code: "SEMANTIC_SEARCH_QUOTA_EXCEEDED",
          message: "Bạn đã dùng hết lượt tìm kiếm ngữ nghĩa trong tháng.",
          resetAt: resetAt.toISOString(),
        });
      }
    } catch {
      console.error("Could not verify the semantic search quota.");
      return res
        .status(503)
        .json({ message: "Tìm kiếm tạm thời không khả dụng" });
    }

    // 2. Generate query embedding
    let queryEmbedding;
    try {
      queryEmbedding = await generateQueryEmbedding(query);
      if (!queryEmbedding) {
        return res
          .status(503)
          .json({ message: "Tìm kiếm tạm thời không khả dụng" });
      }
    } catch {
      return res
        .status(503)
        .json({ message: "Tìm kiếm tạm thời không khả dụng" });
    }

    // 3. Fetch all notes
    const notes = await Note.find({
      userId: req.user!.id,
      embeddingStatus: "success",
    })
      .select(noteResponseProjection)
      .populate(noteMetadataPopulation(accountId));

    if (notes.length === 0) {
      return res
        .status(404)
        .json({ message: "Chưa có ghi chú phù hợp để tìm kiếm" });
    }

    // 4. Prepare stopwords and query keywords
    const stopWords = new Set([
      "the",
      "be",
      "to",
      "of",
      "and",
      "a",
      "in",
      "that",
      "have",
      "i",
      "it",
      "for",
      "not",
      "on",
      "with",
      "he",
      "as",
      "you",
      "do",
      "at",
      "this",
      "but",
      "his",
      "by",
      "from",
      "they",
      "we",
      "say",
      "her",
      "she",
      "or",
      "an",
      "will",
      "my",
      "one",
      "all",
      "would",
      "there",
      "their",
      "about",
      "if",
      "can",
      "when",
      "use",
      "what",
      "which",
      "how",
      "get",
      "your",
      "just",
      "like",
      "so",
      "then",
      "some",
      "could",
      "see",
      "time",
      "other",
      "than",
      "into",
      "them",
      "these",
      "make",
      "more",
      "way",
      "first",
    ]);
    const queryWords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));

    // 5. Score each note (semantic and keyword separately)
    const scored = notes.map((note) => {
      const semanticScore = cosineSimilarity(queryEmbedding, note.embedding);

      // keyword ratio: proportion of query words that appear in title or content
      const noteText = (note.title + " " + note.content).toLowerCase();
      let matchedKeywords = 0;
      queryWords.forEach((word) => {
        if (noteText.includes(word)) matchedKeywords++;
      });
      const keywordRatio =
        queryWords.length > 0 ? matchedKeywords / queryWords.length : 0;

      // Do not send the 768-number embedding back to the client
      const { embedding: _embedding, ...noteData } = note.toObject();
      return {
        ...noteData,
        semanticScore,
        keywordRatio,
      };
    });

    // 6. Rank by semantic score; keywords only nudge the order.
    //    Gemini scores sit in a narrow band (unrelated notes still score
    //    ~0.5-0.6), so an absolute threshold does not work. Cut relative to
    //    the best hit instead. MIN_SCORE and MARGIN were calibrated on 11 notes;
    //    recalibrate when the note count grows.
    const MIN_SCORE = 0.6;
    const MARGIN = 0.06;
    const KEYWORD_BONUS = 0.05;

    const ranked = scored
      .map((item) => ({
        ...item,
        finalScore: item.semanticScore + KEYWORD_BONUS * item.keywordRatio,
      }))
      .toSorted((a, b) => b.finalScore - a.finalScore);

    const best = ranked[0]?.finalScore ?? 0;
    const passing = ranked.filter(
      (item) =>
        item.finalScore >= MIN_SCORE && item.finalScore >= best - MARGIN,
    );
    const finalResults = passing.slice(0, TOP_K);

    if (finalResults.length === 0) {
      return res.status(404).json({
        message: "Không tìm thấy kết quả phù hợp",
        suggestion: "Thử dùng từ khóa cụ thể hơn hoặc thêm ghi chú mới",
      });
    }

    // 7. Save search log (store semantic scores for later analysis)
    try {
      const searchLog = new SearchLog({
        userId: req.user!.id,
        query: query,
        results: finalResults.map((r) => r._id),
        resultCount: finalResults.length,
        topScores: finalResults.map((r) => r.semanticScore), // keep semantic only
      });
      await searchLog.save();
    } catch (logError) {
      console.error("Failed to save search log:", logError);
    }

    // 8. Return results (both scores available for client-side display if needed)
    res.json({
      results: finalResults,
      totalFound: passing.length,
      returned: finalResults.length,
      threshold: MIN_SCORE,
      noteCount: noteCount,
    });
  } catch (error) {
    console.error("Semantic search error:", error);
    res.status(500).json({ message: "Lỗi tìm kiếm" });
  }
};
