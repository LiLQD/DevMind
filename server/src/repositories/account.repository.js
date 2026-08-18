const Account = require('../models/Account');

async function findByEmail(email) {
  return Account.findOne({ email });
}

async function findById(id) {
  return Account.findById(id);
}

async function create(data) {
  return Account.create({
    email: data.email,
    passwordHash: data.passwordHash,
    role: data.role || 'users',
  });
}

module.exports = { findByEmail, findById, create };
