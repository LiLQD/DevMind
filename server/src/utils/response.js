// Chuẩn hóa response theo đúng format đã thiết kế ở mục 2.6.6 báo cáo
// Mọi controller (stub lẫn thật sau này) đều dùng chung 2 hàm này để đồng bộ toàn hệ thống

function success(res, data, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
  });
}

function fail(res, code, message, statusCode = 400) {
  return res.status(statusCode).json({
    success: false,
    error: { code, message },
  });
}

module.exports = { success, fail };
