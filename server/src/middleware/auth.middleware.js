const jwt = require('jsonwebtoken');
const { fail } = require('../utils/response');

function requireAuth(req, res, next) {
  const authHeader = req.header('Authorization') || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return fail(res, 'UNAUTHORIZED', 'Chưa đăng nhập hoặc thiếu token', 401);
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.userId, role: payload.role };
    next();
  } catch (err) {
    return fail(res, 'UNAUTHORIZED', 'Token không hợp lệ hoặc đã hết hạn', 401);
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return fail(res, 'FORBIDDEN', 'Tài khoản không đủ quyền truy cập', 403);
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
