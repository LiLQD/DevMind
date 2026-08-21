import Note from '../models/Note.js';
import Tag from '../models/Tag.js';
import Collection from '../models/Collection.js';
import { generateEmbedding, cosineSimilarity } from '../services/embedding.service.js';

// Create note
export const createNote = async (req, res) => {
  try {
    const { title, content, tags, collections } = req.body;
    
    // Validate input
    if (!title || !content) {
      return res.status(400).json({ 
        message: 'Thiếu title hoặc content' // "Missing title or content" - matches TC02
      });
    }
    
    if (title.length > 200) {
      return res.status(400).json({ 
        message: 'Tiêu đề vượt quá 200 ký tự' // "Title exceeds 200 characters" - matches TC03
      });
    }
    
    // Create note with pending status 
    const note = new Note({
      title,
      content,
      userId: req.user.id,
      embeddingStatus: 'pending',
      tags: tags || [],
      collections: collections || []
    });
    
    await note.save();
    
    // Try to generate embedding asynchronously 
    try {
      const embedding = await generateEmbedding(content);
      if (embedding) {
        note.embedding = embedding;
        note.embeddingStatus = 'success';
      } else {
        note.embeddingStatus = 'failed';
      }
      await note.save();
    } catch (aiError) {
      // Note still saved even if AI fails 
      note.embeddingStatus = 'failed';
      await note.save();
      console.error('AI embedding failed but note saved:', aiError);
    }
    
    const populatedNote = await note.populate(['tags', 'collections']);
    res.status(201).json(populatedNote);
    
  } catch (error) {
    console.error('Create note error:', error);
    res.status(500).json({ message: 'Tạo ghi chú thất bại' }); // matches TC05
  }
};

// Get all notes
export const getNotes = async (req, res) => {
  try {
    const { tagId, collectionId } = req.query;
    const query = { userId: req.user.id };
    
    if (tagId) query.tags = tagId;
    if (collectionId) query.collections = collectionId;
    
    const notes = await Note.find(query)
      .populate(['tags', 'collections'])
      .sort({ createdAt: -1 });
    
    res.json(notes);
  } catch (error) {
    console.error('Get notes error:', error);
    res.status(500).json({ message: 'Lỗi lấy danh sách ghi chú' });
  }
};

// Get single note with related suggestions 
export const getNote = async (req, res) => {
  try {
    const note = await Note.findById(req.params.id)
      .populate(['tags', 'collections']);
    
    if (!note) {
      return res.status(404).json({ message: 'Không tìm thấy ghi chú' });
    }
    
    // Check ownership
    if (note.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Không có quyền truy cập' });
    }
    
    // Get related notes if embedding exists 
    let relatedNotes = [];
    if (note.embeddingStatus === 'success' && note.embedding) {
      const otherNotes = await Note.find({
        userId: req.user.id,
        _id: { $ne: note._id },
        embeddingStatus: 'success'
      });
      
      const scored = otherNotes.map(n => ({
        ...n.toObject(),
        similarityScore: cosineSimilarity(note.embedding, n.embedding)
      }));
      
      const THRESHOLD = 0.65;
      relatedNotes = scored
        .filter(item => item.similarityScore >= THRESHOLD)
        .sort((a, b) => b.similarityScore - a.similarityScore)
        .slice(0, 5);
    }
    
    res.json({
      ...note.toObject(),
      relatedNotes
    });
    
  } catch (error) {
    console.error('Get note error:', error);
    res.status(500).json({ message: 'Lỗi lấy ghi chú' });
  }
};

// Update note
export const updateNote = async (req, res) => {
  try {
    const { title, content, tags, collections } = req.body;
    const note = await Note.findById(req.params.id);
    
    if (!note) {
      return res.status(404).json({ message: 'Không tìm thấy ghi chú' });
    }
    
    if (note.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Không có quyền' });
    }
    
    // Update fields
    if (title) note.title = title;
    if (content) note.content = content;
    if (tags) note.tags = tags;
    if (collections) note.collections = collections;
    
    // If content changed, regenerate embedding
    if (content && content !== note.content) {
      note.embeddingStatus = 'pending';
      try {
        const embedding = await generateEmbedding(content);
        if (embedding) {
          note.embedding = embedding;
          note.embeddingStatus = 'success';
        } else {
          note.embeddingStatus = 'failed';
        }
      } catch (error) {
        note.embeddingStatus = 'failed';
      }
    }
    
    await note.save();
    const populatedNote = await note.populate(['tags', 'collections']);
    res.json(populatedNote);
    
  } catch (error) {
    console.error('Update note error:', error);
    res.status(500).json({ message: 'Cập nhật thất bại' });
  }
};

// Delete note
export const deleteNote = async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    
    if (!note) {
      return res.status(404).json({ message: 'Không tìm thấy ghi chú' });
    }
    
    if (note.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Không có quyền' });
    }
    
    await note.deleteOne();
    res.json({ message: 'Xóa ghi chú thành công' });
    
  } catch (error) {
    console.error('Delete note error:', error);
    res.status(500).json({ message: 'Xóa thất bại' });
  }
};
