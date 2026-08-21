import express from 'express';
import {
  createNote,
  getNotes,
  getNote,
  updateNote,
  deleteNote
} from '../controllers/note.controller.js';
import { semanticSearch } from '../controllers/search.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

// All note routes require authentication
router.use(protect);

// Note CRUD
router.route('/')
  .get(getNotes)
  .post(createNote);

// Semantic search
router.post('/search', semanticSearch);

// Individual note operations
router.route('/:id')
  .get(getNote)
  .put(updateNote)
  .delete(deleteNote);

export default router;
