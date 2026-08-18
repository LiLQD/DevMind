const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const accountRepository = require('../repositories/account.repository');

const SALT_ROUNDS = 10;

async function register(email, password) {
  const existing = await accountRepository.findByEmail(email);
  if (existing) {
    const err = new Error('Email đã được sử dụng');
    err.code = 'EMAIL_EXISTS';
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const account = await accountRepository.create({ email, passwordHash, role: 'users' });

  return {
    id: account._id,
    email: account.email,
    role: account.role,
    createdAt: account.createdAt,
  };
}

async function login(email, password) {
  const account = await accountRepository.findByEmail(email);

  if (!account) {
    const err = new Error('Email hoặc mật khẩu không đúng');
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  if (account.status === 'locked') {
    const err = new Error('Tài khoản đã bị vô hiệu hóa');
    err.code = 'ACCOUNT_LOCKED';
    throw err;
  }

  const passwordMatches = await bcrypt.compare(password, account.passwordHash);
  if (!passwordMatches) {
    const err = new Error('Email hoặc mật khẩu không đúng');
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  const token = jwt.sign(
    { userId: account._id, role: account.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  return {
    token,
    account: { id: account._id, email: account.email, role: account.role },
  };
}

module.exports = { register, login };
