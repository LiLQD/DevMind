import Note from '../models/Note.js';
import SearchLog from '../models/SearchLog.js';
import { generateQueryEmbedding, cosineSimilarity, filterStopWords } from '../services/embedding.service.js';

// Semantic search with hybrid scoring
export const semanticSearch = async (req, res) => {
  try {
    const { query } = req.body;
    const TOP_K = 5;
    
    if (!query || query.trim() === '') {
      return res.status(400).json({ message: 'Vui lòng nhập từ khóa' });
    }
    
    // 1. Get note count for dynamic threshold
    const noteCount = await Note.countDocuments({ 
      userId: req.user.id, 
      embeddingStatus: 'success' 
    });
    
    // 2. Generate embedding
    let queryEmbedding;
    try {
      queryEmbedding = await generateQueryEmbedding(query);
      if (!queryEmbedding) {
        return res.status(503).json({ message: 'Tìm kiếm tạm thời không khả dụng' });
      }
    } catch (error) {
      return res.status(503).json({ message: 'Tìm kiếm tạm thời không khả dụng' });
    }
    
    // 3. Get notes with successful embedding
    const notes = await Note.find({
      userId: req.user.id,
      embeddingStatus: 'success'
    }).populate(['tags', 'collections']);
    
    if (notes.length === 0) {
      return res.status(404).json({ message: 'Chưa có ghi chú phù hợp để tìm kiếm' });
    }
    
    // 4. Dynamic threshold based on note count
    const THRESHOLD = noteCount < 10 ? 0.75 : 0.65;
    
    // 5. Calculate scores
    const queryWords = query.toLowerCase().split(' ')
      .filter(w => w.length > 2);
    const stopWordsSet = new Set(['the','be','to','of','and','a','in','that','have','i','it','for','not','on','with','he','as','you','do','at','this','but','his','by','from','they','we','say','her','she','or','an','will','my','one','all','would','there','their','about','if','can','when','use','what','which','how','get','your','just','like','so','then','some','could','see','time','other','than','into','them','these','make','more','way','first']);
    const filteredQueryWords = queryWords.filter(w => !stopWordsSet.has(w));
    
    const scored = notes.map(note => {
      // Semantic similarity
      const semanticScore = cosineSimilarity(queryEmbedding, note.embedding);
      
      // Keyword matching (only meaningful words)
      const titleWords = note.title.toLowerCase().split(' ');
      const contentWords = note.content.toLowerCase().split(' ');
      let keywordMatches = 0;
      let maxMatches = 0;
      filteredQueryWords.forEach(word => {
        if (titleWords.includes(word)) { keywordMatches += 2; maxMatches += 2; }
        if (contentWords.includes(word)) { keywordMatches += 1; maxMatches += 1; }
      });
      const keywordScore = maxMatches > 0 ? keywordMatches / maxMatches : 0;
      
      // Combined: semantic 70%, keyword 30%
      const combinedScore = (semanticScore * 0.7) + (keywordScore * 0.3);
      
      return {
        ...note.toObject(),
        semanticScore,
        keywordScore,
        similarityScore: combinedScore
      };
    });
    
    // 6. Filter and sort
    const filtered = scored
      .filter(item => item.similarityScore >= THRESHOLD)
      .sort((a, b) => b.similarityScore - a.similarityScore);
    
    if (filtered.length === 0) {
      return res.status(404).json({ 
        message: 'Không tìm thấy kết quả phù hợp',
        suggestion: 'Try using different keywords or create more notes'
      });
    }
    
    const results = filtered.slice(0, TOP_K);
    
    // 7. Save search log
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
      threshold: THRESHOLD,
      noteCount: noteCount
    });
    
  } catch (error) {
    console.error('Semantic search error:', error);
    res.status(500).json({ message: 'Lỗi tìm kiếm' });
  }
};
