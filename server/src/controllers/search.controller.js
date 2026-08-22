import Note from '../models/Note.js';
import SearchLog from '../models/SearchLog.js';
import { generateEmbedding, cosineSimilarity } from '../services/embedding.service.js';

// Semantic search
export const semanticSearch = async (req, res) => {
  try {
    const { query } = req.body;
    const noteCount = await Note.countDocuments({ userId: req.user.id, embeddingStatus: 'success' });

    // If few notes, require higher similarity
    const THRESHOLD = noteCount < 10 ? 0.75 : 0.66;
    const TOP_K = 5;       
    
    if (!query || query.trim() === '') {
      return res.status(400).json({ 
        message: 'Vui lòng nhập từ khóa' // matches TC07
      });
    }
    
    // Generate embedding for query
    let queryEmbedding;
    try {
      queryEmbedding = await generateEmbedding(query);
      if (!queryEmbedding) {
        return res.status(503).json({ 
          message: 'Tìm kiếm tạm thời không khả dụng' // matches TC08
        });
      }
    } catch (error) {
      return res.status(503).json({ 
        message: 'Tìm kiếm tạm thời không khả dụng'
      });
    }
    
    // Get notes with successful embedding
    const notes = await Note.find({
      userId: req.user.id,
      embeddingStatus: 'success'
    }).populate(['tags', 'collections']);
    
    if (notes.length === 0) {
      return res.status(404).json({ 
        message: 'Chưa có ghi chú phù hợp để tìm kiếm' // matches TC09
      });
    }
    
    // Calculate similarity
    const scored = notes.map(note => ({
      ...note.toObject(),
      similarityScore: cosineSimilarity(queryEmbedding, note.embedding)
    }));
    
    // Filter by threshold and sort
    const filtered = scored
      .filter(item => item.similarityScore >= THRESHOLD)
      .sort((a, b) => b.similarityScore - a.similarityScore);
    
    if (filtered.length === 0) {
      return res.status(404).json({ 
        message: 'Không tìm thấy kết quả phù hợp' // matches TC10
      });
    }
    
    // Get Top-K results
    const results = filtered.slice(0, TOP_K);
    
    // Save search log
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
      // Don't fail the search if logging fails
    }
    
    res.json({
      results,
      totalFound: filtered.length,
      returned: results.length
    });
    
  } catch (error) {
    console.error('Semantic search error:', error);
    res.status(500).json({ message: 'Lỗi tìm kiếm' });
  }
};

// Get search history
export const getSearchHistory = async (req, res) => {
  try {
    const logs = await SearchLog.find({ userId: req.user.id })
      .sort({ timestamp: -1 })
      .limit(20)
      .populate('results', 'title');
    
    res.json(logs);
  } catch (error) {
    console.error('Get search history error:', error);
    res.status(500).json({ message: 'Lỗi lấy lịch sử' });
  }
};
