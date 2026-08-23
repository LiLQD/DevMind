import Note from '../models/Note.js';
import SearchLog from '../models/SearchLog.js';
import { generateQueryEmbedding, cosineSimilarity } from '../services/embedding.service.js';

export const semanticSearch = async (req, res) => {
  try {
    const { query } = req.body;
    const TOP_K = 5;

    if (!query || query.trim() === '') {
      return res.status(400).json({ message: 'Vui lòng nhập từ khóa' });
    }

    // 1. Count notes for threshold adjustment
    const noteCount = await Note.countDocuments({
      userId: req.user.id,
      embeddingStatus: 'success'
    });

    // 2. Generate query embedding
    let queryEmbedding;
    try {
      queryEmbedding = await generateQueryEmbedding(query);
      if (!queryEmbedding) {
        return res.status(503).json({ message: 'Tìm kiếm tạm thời không khả dụng' });
      }
    } catch (error) {
      return res.status(503).json({ message: 'Tìm kiếm tạm thời không khả dụng' });
    }

    // 3. Fetch all notes
    const notes = await Note.find({
      userId: req.user.id,
      embeddingStatus: 'success'
    }).populate(['tags', 'collections']);

    if (notes.length === 0) {
      return res.status(404).json({ message: 'Chưa có ghi chú phù hợp để tìm kiếm' });
    }

    // 4. Prepare stopwords and query keywords
    const stopWords = new Set([
      'the','be','to','of','and','a','in','that','have','i','it','for','not','on','with','he','as','you','do','at',
      'this','but','his','by','from','they','we','say','her','she','or','an','will','my','one','all','would','there',
      'their','about','if','can','when','use','what','which','how','get','your','just','like','so','then','some','could',
      'see','time','other','than','into','them','these','make','more','way','first'
    ]);
    const queryWords = query.toLowerCase().split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));

    // 5. Score each note (semantic and keyword separately)
    const scored = notes.map(note => {
      const semanticScore = cosineSimilarity(queryEmbedding, note.embedding);

      // keyword ratio: proportion of query words that appear in title or content
      const noteText = (note.title + ' ' + note.content).toLowerCase();
      let matchedKeywords = 0;
      queryWords.forEach(word => {
        if (noteText.includes(word)) matchedKeywords++;
      });
      const keywordRatio = queryWords.length > 0 ? matchedKeywords / queryWords.length : 0;

      return {
        ...note.toObject(),
        semanticScore,
        keywordRatio,
      };
    });

    // 6. Semantic threshold based on note count (more notes = lower threshold)
    let baseThreshold = 0.70;
    if (noteCount < 10) baseThreshold = 0.85;
    else if (noteCount < 20) baseThreshold = 0.80;
    else if (noteCount < 50) baseThreshold = 0.75;
    else baseThreshold = 0.70;

    // Filter by semantic score
    let semanticResults = scored.filter(item => item.semanticScore >= baseThreshold);

    // Sort by semantic score descending
    semanticResults.sort((a, b) => b.semanticScore - a.semanticScore);

    // 7. (Optional) Tie‑breaker: reorder within groups where semantic scores are very close
    //    Use keywordRatio to break ties. Group by consecutive differences < 0.05.
    if (semanticResults.length > 0) {
      const groups = [];
      let currentGroup = [semanticResults[0]];

      for (let i = 1; i < semanticResults.length; i++) {
        // Compare with the last element of the current group (not the first)
        const lastScore = currentGroup[currentGroup.length - 1].semanticScore;
        const currentScore = semanticResults[i].semanticScore;
        if (lastScore - currentScore < 0.05) {
          currentGroup.push(semanticResults[i]);
        } else {
          groups.push(currentGroup);
          currentGroup = [semanticResults[i]];
        }
      }
      if (currentGroup.length > 0) groups.push(currentGroup);

      // Sort each group by keywordRatio descending, then flatten
      const reordered = [];
      for (const group of groups) {
        group.sort((a, b) => b.keywordRatio - a.keywordRatio);
        reordered.push(...group);
      }
      semanticResults = reordered;
    }

    // Take top K
    let finalResults = semanticResults.slice(0, TOP_K);

    // 8. Graceful fallback: if semantic filter returned nothing, use keyword-only ranking
    if (finalResults.length === 0) {
      // Sort all notes by keywordRatio descending
      const keywordSorted = [...scored].sort((a, b) => b.keywordRatio - a.keywordRatio);
      // Only take those with at least some keyword match
      const keywordCandidates = keywordSorted.filter(item => item.keywordRatio > 0);
      finalResults = keywordCandidates.slice(0, TOP_K);
    }

    if (finalResults.length === 0) {
      return res.status(404).json({
        message: 'Không tìm thấy kết quả phù hợp',
        suggestion: 'Thử dùng từ khóa cụ thể hơn hoặc thêm ghi chú mới'
      });
    }

    // 9. Save search log (store semantic scores for later analysis)
    try {
      const searchLog = new SearchLog({
        userId: req.user.id,
        query: query,
        results: finalResults.map(r => r._id),
        resultCount: finalResults.length,
        topScores: finalResults.map(r => r.semanticScore), // keep semantic only
      });
      await searchLog.save();
    } catch (logError) {
      console.error('Failed to save search log:', logError);
    }

    // 10. Return results (both scores available for client-side display if needed)
    res.json({
      results: finalResults,
      totalFound: semanticResults.length,
      returned: finalResults.length,
      threshold: baseThreshold,
      noteCount: noteCount,
    });

  } catch (error) {
    console.error('Semantic search error:', error);
    res.status(500).json({ message: 'Lỗi tìm kiếm' });
  }
};
