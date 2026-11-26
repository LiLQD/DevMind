import express from "express";
import {
  createNote,
  getNotes,
  getNote,
  updateNote,
  deleteNote,
} from "../controllers/note.controller.ts";
import { bulkImportNotes } from "../controllers/note-import.controller.ts";
import { searchNotes } from "../controllers/search.controller.ts";
import { protect } from "../middleware/auth.middleware.ts";

import { suggestNoteOrganization } from "../controllers/note-suggestions.controller.ts";
import { suggestionLimiter } from "../middleware/rateLimiter.ts";

import { setNoteFavorite } from "../controllers/note-favorite.controller.ts";

const router = express.Router();

// All note routes require authentication
router.use(protect);

// Note CRUD
router.route("/").get(getNotes).post(createNote);

// Semantic search
router.post("/search", searchNotes);
router.post("/import", bulkImportNotes);
router.post("/suggestions", suggestionLimiter, suggestNoteOrganization);

router.put("/:id/favorite", setNoteFavorite);

// Individual note operations
router.route("/:id").get(getNote).put(updateNote).delete(deleteNote);

export default router;
