const { success, fail } = require('../utils/response');

// STUB SearchController - khớp pseudocode SemanticSearch (mục 3.3.1) và
// sequence diagram "Tìm kiếm ngữ nghĩa" (mục 2.7.2).

function search(req, res) {
  const { query } = req.body || {};

  if (!query || !query.trim()) {
    return fail(res, 'EMPTY_QUERY', 'Vui lòng nhập từ khóa', 422);
  }

  // Nhánh lỗi AI ở sequence diagram: demo bằng query đặc biệt
  if (query === '__aifail') {
    return fail(res, 'AI_SERVICE_UNAVAILABLE', 'Tìm kiếm tạm thời không khả dụng', 503);
  }

  // Kết quả giả lập - cố ý dùng từ khóa KHÁC với nội dung gốc của note-001
  // ("xử lý request bị trùng lặp" thay vì "idempotency") để thể hiện đúng
  // giá trị của semantic search khi demo cho thầy.
  return success(res, [
    { noteId: 'note-001', title: 'Fix double submit bug', score: 0.89 },
    { noteId: 'note-003', title: 'Rate limit API bằng token bucket', score: 0.74 },
  ]);
}

module.exports = { search };
