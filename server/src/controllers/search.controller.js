import Note from '../models/Note.js';
import SearchLog from '../models/SearchLog.js';
import { generateQueryEmbedding, cosineSimilarity, filterStopWords } from '../services/embedding.service.js';

export const semanticSearch = async (req, res) => {
  try {
    const { query } = req.body;
    const TOP_K = 5;

    if (!query || query.trim() === '') {
      return res.status(400).json({ message: 'Vui lòng nhập từ khóa' });
    }

    // 1. Get notes count for dynamic threshold
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

    // 3. Fetch notes
    const notes = await Note.find({
      userId: req.user.id,
      embeddingStatus: 'success'
    }).populate(['tags', 'collections']);

    if (notes.length === 0) {
      return res.status(404).json({ message: 'Chưa có ghi chú phù hợp để tìm kiếm' });
    }

    // 4. Prepare query keywords (stopword‑filtered)
    const stopWords = new Set([
      'the','be','to','of','and','a','in','that','have','i','it','for','not','on','with','he','as','you','do','at',
      'this','but','his','by','from','they','we','say','her','she','or','an','will','my','one','all','would','there',
      'their','about','if','can','when','use','what','which','how','get','your','just','like','so','then','some','could',
      'see','time','other','than','into','them','these','make','more','way','first'
    ]);
    const queryWords = query.toLowerCase().split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));

    // 5. Score each note
    let scored = notes.map(note => {
      // Semantic similarity
      const semanticScore = cosineSimilarity(queryEmbedding, note.embedding);

      // Keyword matching (count how many query words appear in title+content)
      const noteText = (note.title + ' ' + note.content).toLowerCase();
      let matchedKeywords = 0;
      queryWords.forEach(word => {
        if (noteText.includes(word)) matchedKeywords++;
      });
      const keywordRatio = queryWords.length > 0 ? matchedKeywords / queryWords.length : 0;

      // Combined score: semantic 60%, keyword 40%
      let combinedScore = semanticScore * 0.6 + keywordRatio * 0.4;

      // Penalty: if query has meaningful words but none match → reduce by 40%
      if (queryWords.length > 0 && keywordRatio === 0) {
        combinedScore *= 0.6;
      }

      // Length penalty: shorter notes (< 30 words) get a 10% penalty
      const wordCount = note.content.split(/\s+/).length;
      if (wordCount < 30) {
        combinedScore *= 0.9;
      }

      return {
        ...note.toObject(),
        semanticScore,
        keywordRatio,
        similarityScore: combinedScore
      };
    });

    // 6. Remove notes that have zero similarity after penalties
    scored = scored.filter(item => item.similarityScore > 0.1);

    // 7. Dynamic threshold
    let baseThreshold = 0.70;
    if (noteCount < 10) baseThreshold = 0.85;
    else if (noteCount < 20) baseThreshold = 0.80;
    else if (noteCount < 50) baseThreshold = 0.75;
    else baseThreshold = 0.70;

    // 8. If all scores are close, raise the threshold further
    if (scored.length > 0) {
      const scores = scored.map(s => s.similarityScore);
      const avgScore = scores.reduce((a,b) => a+b, 0) / scores.length;
      const maxScore = Math.max(...scores);
      const minScore = Math.min(...scores);
      // If the spread is small (i.e., all scores are similar), raise threshold
      if (maxScore - minScore < 0.15) {
        baseThreshold = Math.max(baseThreshold, 0.80);
      }
      // If the average is already high, use a higher threshold to filter more
      if (avgScore > 0.75) {
        baseThreshold = Math.max(baseThreshold, 0.78);
      }
    }

    // 9. Filter and sort
    const filtered = scored
      .filter(item => item.similarityScore >= baseThreshold)
      .sort((a, b) => b.similarityScore - a.similarityScore);

    if (filtered.length === 0) {
      return res.status(404).json({
        message: 'Không tìm thấy kết quả phù hợp',
        suggestion: 'Try using more specific keywords or add more notes'
      });
    }

    const results = filtered.slice(0, TOP_K);

    // 10. Save search log (non‑blocking)
    try {
      const searchLog = new SearchLog({
        userId: req.user.id,
        query: query,
        results: results.map(r => r._id),
        resultCount: results.length,
        topScores: results.map(r => r.similarityScore)
      });
      await searchLog.save();
    } catch (logError) {
      console.error('Failed to save search log:', logError);
    }

    res.json({
      results,
      totalFound: filtered.length,
      returned: results.length,
      threshold: baseThreshold,
      noteCount: noteCount
    });

  } catch (error) {
    console.error('Semantic search error:', error);
    res.status(500).json({ message: 'Lỗi tìm kiếm' });
  }
};
