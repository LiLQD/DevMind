import assert from "node:assert/strict";
import { mock, test } from "node:test";
import jwt from "jsonwebtoken";

const secret = "auth-middleware-test-secret";
const account = {
  _id: "507f1f77bcf86cd799439011",
  email: "user@example.com",
  role: "user",
  isActive: true,
};
const token = jwt.sign({ id: account._id }, secret, { noTimestamp: true });
const Account = { findById: mock.fn() };

mock.module("../src/models/Account.ts", { exports: { default: Account } });
mock.module("../src/config/env.ts", {
  exports: { env: { JWT_SECRET: secret } },
});

const { protect, admin, staff } =
  await import("../src/middleware/auth.middleware.js");

function response() {
  return {
    status: mock.fn(function () {
      return this;
    }),
    json: mock.fn(),
  };
}

for (const [name, authorization, result, message] of [
  ["missing", undefined, null, "Không có token xác thực"],
  ["invalid", "Bearer invalid", null, "Token không hợp lệ"],
  ["unknown account", `Bearer ${token}`, null, "Token không hợp lệ"],
  [
    "inactive account",
    `Bearer ${token}`,
    { ...account, isActive: false },
    "Token không hợp lệ",
  ],
]) {
  test(`protect returns 401 for ${name}`, async (t) => {
    t.mock.method(Account, "findById", () => ({ select: async () => result }));
    t.mock.method(console, "error", () => {});
    const req = { headers: { authorization } };
    const res = response();
    const next = t.mock.fn();

    await protect(req, res, next);

    assert.equal(res.status.mock.calls[0].arguments[0], 401);
    assert.deepEqual(res.json.mock.calls[0].arguments[0], { message });
    assert.equal(next.mock.callCount(), 0);
    assert.equal(req.user, undefined);
  });
}

test("protect sets req.user for an active account and continues", async (t) => {
  t.mock.method(Account, "findById", (id) => ({
    select: async () => (id === account._id ? account : null),
  }));
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = response();
  const next = t.mock.fn();

  await protect(req, res, next);

  assert.deepEqual(req.user, {
    id: account._id,
    email: account.email,
    role: account.role,
  });
  assert.equal(next.mock.callCount(), 1);
  assert.equal(res.status.mock.callCount(), 0);
});

for (const [name, middleware, allowed, message] of [
  ["admin", admin, ["admin"], "Yêu cầu quyền Admin"],
  ["staff", staff, ["staff", "admin"], "Yêu cầu quyền Staff"],
]) {
  for (const role of ["user", "staff", "admin"]) {
    const permits = allowed.includes(role);
    test(`${name} ${permits ? "allows" : "rejects"} the ${role} role`, async (t) => {
      const res = response();
      const next = t.mock.fn();

      await middleware({ user: { role } }, res, next);

      assert.equal(next.mock.callCount(), permits ? 1 : 0);
      assert.equal(res.status.mock.callCount(), permits ? 0 : 1);
      if (!permits) {
        assert.equal(res.status.mock.calls[0].arguments[0], 403);
        assert.deepEqual(res.json.mock.calls[0].arguments[0], { message });
      }
    });
  }
}
