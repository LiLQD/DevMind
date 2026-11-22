import type { RequestHandler } from "express";
import Note from "../models/Note.ts";
import SearchLog from "../models/SearchLog.ts";
import { recordUsage } from "../services/usage.service.ts";
import {
  generateQueryEmbedding,
  cosineSimilarity,
} from "../services/embedding.service.ts";

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
  const results = await Note.find({
    userId: req.user!.id,
    $or: [{ title: match }, { content: match }],
  })
    .select("-embedding")
    .populate(["tags", "collections"])
    .sort({ updatedAt: -1, _id: -1 });
  res.json({ results });
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

    // 1. Count notes (reported back in the response)
    const noteCount = await Note.countDocuments({
      userId: req.user!.id,
      embeddingStatus: "success",
    });

    // 2. Generate query embedding
    let queryEmbedding;
    try {
      await recordUsage(req.user!.id, "semanticSearchRequests");
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
    }).populate(["tags", "collections"]);

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
