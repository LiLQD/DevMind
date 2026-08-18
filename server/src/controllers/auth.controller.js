const { success, fail } = require('../utils/response');
const authService = require('../services/auth.service');

async function register(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return fail(res, 'VALIDATION_ERROR', 'Thiếu email hoặc mật khẩu', 422);
  }

  try {
    const account = await authService.register(email, password);
    return success(res, account, 201);
  } catch (err) {
    if (err.code === 'EMAIL_EXISTS') {
      return fail(res, err.code, err.message, 409);
    }
    console.error('register error:', err);
    return fail(res, 'INTERNAL_ERROR', 'Có lỗi xảy ra, vui lòng thử lại', 500);
  }
}

async function login(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return fail(res, 'VALIDATION_ERROR', 'Thiếu email hoặc mật khẩu', 422);
  }

  try {
    const result = await authService.login(email, password);
    return success(res, result);
  } catch (err) {
    if (err.code === 'INVALID_CREDENTIALS') {
      return fail(res, err.code, err.message, 401);
    }
    if (err.code === 'ACCOUNT_LOCKED') {
      return fail(res, err.code, err.message, 403);
    }
    console.error('login error:', err);
    return fail(res, 'INTERNAL_ERROR', 'Có lỗi xảy ra, vui lòng thử lại', 500);
  }
}

function logout(req, res) {
  return success(res, { message: 'Đã đăng xuất' });
}

function updateProfile(req, res) {
  const updates = req.body || {};
  return success(res, {
    id: req.user.id,
    email: updates.email || 'user@example.com',
    role: req.user.role,
    updatedAt: new Date().toISOString(),
  });
}

module.exports = { register, login, logout, updateProfile };
