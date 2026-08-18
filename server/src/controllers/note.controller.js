const { success, fail } = require('../utils/response');

// STUB NoteController - khớp mục 2.4.3 (schema Note) và sequence diagram
// "Tạo ghi chú" / "Xem gợi ý ghi chú liên quan" (mục 2.7.1, 2.7.3).
// Dữ liệu demo lấy lại đúng ví dụ đã dùng xuyên suốt báo cáo để bro test
// bằng chính nội dung quen thuộc thay vì "lorem ipsum".

const DEMO_NOTES = [
  {
    id: 'note-001',
    title: 'Fix double submit bug',
    content: 'Dùng idempotency key lưu trong Redis để chặn request gửi trùng khi client bấm submit nhiều lần.',
    type: 'solution',
    tagIds: ['tag-backend', 'tag-idempotency'],
    embeddingStatus: 'success',
    createdAt: '2026-07-18T10:00:00Z',
  },
  {
    id: 'note-002',
    title: 'Debounce hook cho search input',
    content: 'Custom hook useDebounce trì hoãn gọi API tìm kiếm 300ms sau lần gõ cuối.',
    type: 'code_snippet',
    tagIds: ['tag-react'],
    embeddingStatus: 'success',
    createdAt: '2026-07-20T09:00:00Z',
  },
];

function createNote(req, res) {
  const { title, content, type } = req.body || {};
  if (!title || !content) {
    return fail(res, 'VALIDATION_ERROR', 'Thiếu title hoặc content', 422);
  }

  // Nhánh lỗi AI ở sequence diagram 2.7.1: demo bằng cách gõ content chứa "__aifail"
  const aiFailed = content.includes('__aifail');

  return success(
    res,
    {
      id: 'note-' + Date.now(),
      userId: req.user.id,
      title,
      content,
      type: type || 'note',
      tagIds: [],
      embedding: aiFailed ? null : new Array(1536).fill(0),
      embeddingStatus: aiFailed ? 'failed' : 'success',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    201
  );
}

function getNotes(req, res) {
  return success(res, DEMO_NOTES);
}

function getNoteWithRelated(req, res) {
  const note = DEMO_NOTES.find((n) => n.id === req.params.id) || DEMO_NOTES[0];

  // Khớp nhánh alt "note.embeddingStatus == success" ở sequence diagram 2.7.3
  const relatedNotes =
    note.embeddingStatus === 'success'
      ? [
          { id: 'note-003', title: 'Rate limit API bằng token bucket', score: 0.92 },
          { id: 'note-004', title: 'Webhook Momo xử lý gửi trùng', score: 0.88 },
        ]
      : [];

  return success(res, { note, relatedNotes });
}

function updateNote(req, res) {
  return success(res, {
    id: req.params.id,
    ...req.body,
    updatedAt: new Date().toISOString(),
  });
}

function deleteNote(req, res) {
  return success(res, { id: req.params.id, deleted: true });
}

// --- Tag ---
function createTag(req, res) {
  const { name } = req.body || {};
  if (!name) return fail(res, 'VALIDATION_ERROR', 'Thiếu tên thẻ', 422);
  return success(res, { id: 'tag-' + Date.now(), name, color: '#6366f1', source: 'manual' }, 201);
}
function updateTag(req, res) {
  return success(res, { id: req.params.id, ...req.body });
}
function deleteTag(req, res) {
  return success(res, { id: req.params.id, deleted: true });
}

// --- Collection ---
function createCollection(req, res) {
  const { name } = req.body || {};
  if (!name) return fail(res, 'VALIDATION_ERROR', 'Thiếu tên bộ sưu tập', 422);
  return success(res, { id: 'col-' + Date.now(), name, description: req.body.description || '' }, 201);
}
function updateCollection(req, res) {
  return success(res, { id: req.params.id, ...req.body });
}
function deleteCollection(req, res) {
  return success(res, { id: req.params.id, deleted: true });
}

module.exports = {
  createNote,
  getNotes,
  getNoteWithRelated,
  updateNote,
  deleteNote,
  createTag,
  updateTag,
  deleteTag,
  createCollection,
  updateCollection,
  deleteCollection,
};
