import express from 'express';
import {
  createCollection,
  getCollections,
  updateCollection,
  deleteCollection,
} from '../controllers/collection.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.route('/')
  .get(getCollections)
  .post(createCollection);

router.route('/:id')
  .put(updateCollection)
  .delete(deleteCollection);

export default router;
