const express = require('express');
const noteController = require('../controllers/note.controller');
const searchController = require('../controllers/search.controller');
const { requireAuth } = require('../middleware/auth.middleware');

const router = express.Router();
// Router này mount ở root (không có tiền tố chung như /admin hay /staff) vì gồm
// nhiều nhóm path khác nhau (/notes, /search, /tags, /collections). Vì vậy KHÔNG
// dùng router.use(requireAuth) ở đây (sẽ áp cho mọi path đi qua router, kể cả
// path không khớp route nào) - thay vào đó khai báo requireAuth riêng từng route.

router.post('/notes', requireAuth, noteController.createNote);
router.get('/notes', requireAuth, noteController.getNotes);
router.get('/notes/:id', requireAuth, noteController.getNoteWithRelated);
router.put('/notes/:id', requireAuth, noteController.updateNote);
router.delete('/notes/:id', requireAuth, noteController.deleteNote);

router.post('/search', requireAuth, searchController.search);

router.post('/tags', requireAuth, noteController.createTag);
router.put('/tags/:id', requireAuth, noteController.updateTag);
router.delete('/tags/:id', requireAuth, noteController.deleteTag);

router.post('/collections', requireAuth, noteController.createCollection);
router.put('/collections/:id', requireAuth, noteController.updateCollection);
router.delete('/collections/:id', requireAuth, noteController.deleteCollection);

module.exports = router;
