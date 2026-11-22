import express from "express";
import {
  createTag,
  getTags,
  deleteTag,
} from "../controllers/tag.controller.ts";
import { protect } from "../middleware/auth.middleware.ts";

const router = express.Router();

// All tag routes require authentication
router.use(protect);

router.route("/").get(getTags).post(createTag);

router.route("/:id").delete(deleteTag);

export default router;
