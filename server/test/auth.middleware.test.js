import assert from "node:assert/strict";
import { mock, test } from "node:test";
import jwt from "jsonwebtoken";

import { Types } from "mongoose";
import { configureTestCookies } from "../test-support/cookie-fixture.js";

configureTestCookies();
Object.assign(process.env, {
  MONGODB_URI: "mongodb://auth-middleware-test",
  REDIS_URL: "redis://auth-middleware-test",
  GEMINI_API_KEY: "synthetic-test",
});
const account = {
  id: new Types.ObjectId(),
  email: "user@example.com",
  role: "user",
};
const sessionId = new Types.ObjectId();
const token = jwt.sign(
  { sid: sessionId.toHexString() },
  process.env.COOKIE_AUTH_JWT_SECRET,
  {
    issuer: "devmind",
    audience: "devmind-browser",
    subject: account.id.toHexString(),
    expiresIn: "15m",
  },
);
const getSessionAccount = mock.fn();
mock.module("../src/services/auth-session.service.ts", {
  exports: { getSessionAccount, getRefreshSession: async () => null },
});

const { protect, admin, staff } =
  await import("../src/middleware/auth.middleware.ts");

function response() {
  return {
    status: mock.fn(function () {
      return this;
    }),
    json: mock.fn(),
  };
}

for (const [name, cookie, result] of [
  ["missing cookie", undefined, null],
  ["invalid cookie", "__Host-devmind-access=invalid", null],
  ["unavailable account", `__Host-devmind-access=${token}`, null],
]) {
  test(`protect returns 401 for ${name}`, async (t) => {
    getSessionAccount.mock.mockImplementation(async () => result);
    const req = { method: "GET", headers: { cookie }, get: () => undefined };
    const res = response();
    const next = t.mock.fn();

    await protect(req, res, next);

    assert.equal(res.status.mock.calls[0].arguments[0], 401);
    assert.deepEqual(res.json.mock.calls[0].arguments[0], {
      code: "AUTH_REQUIRED",
      message: "Sign in to continue.",
    });
    assert.equal(next.mock.callCount(), 0);
    assert.equal(req.user, undefined);
  });
}

test("protect sets req.user for an active account and continues", async (t) => {
  getSessionAccount.mock.mockImplementation(async (id, family) =>
    id.equals(account.id) && family.equals(sessionId) ? account : null,
  );
  const req = {
    method: "GET",
    headers: { cookie: `__Host-devmind-access=${token}` },
    get: () => undefined,
  };
  const res = response();
  const next = t.mock.fn();

  await protect(req, res, next);

  assert.deepEqual(req.user, account);
  assert.deepEqual(req.authSessionId, sessionId);
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
