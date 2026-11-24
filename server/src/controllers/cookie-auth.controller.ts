import type { RequestHandler, Response } from "express";
import type { Types } from "mongoose";
import {
  createAuthSession,
  getRefreshSession,
  getSessionAccount,
  revokeAuthSession,
  revokeRefreshSession,
  rotateAuthSession,
} from "../services/auth-session.service.ts";
import {
  clearCredentialProof,
  clearSessionCookies,
  credentialProof,
  readAccessCookie,
  readRefreshCookie,
  readSessionProof,
  sessionProof,
  setSessionCookies,
} from "../services/auth-cookies.ts";
import {
  authFailure,
  canBootstrapProof,
  sessionUnavailable,
} from "../middleware/cookie-auth.middleware.ts";

export async function startCookieSession(
  res: Response,
  user: { id: Types.ObjectId; name: string; email: string; role: string },
  status: 200 | 201,
) {
  const session = await createAuthSession(user.id);
  if (!session) return authFailure(res, "AUTH_REQUIRED");
  clearCredentialProof(res);
  setSessionCookies(res, session);
  return res.status(status).json({ user });
}

export const bootstrapCsrf: RequestHandler = async (req, res) => {
  if (!canBootstrapProof(req)) return authFailure(res, "CSRF_REJECTED");
  if (req.query.purpose === "credentials") {
    return res.json({ csrfToken: credentialProof(res) });
  }
  try {
    const access = readAccessCookie(req);
    if (
      access.status === "valid" &&
      (await getSessionAccount(access.accountId, access.sessionId))
    ) {
      return res.json({ csrfToken: sessionProof(access.sessionId) });
    }
    const refresh = await getRefreshSession(readRefreshCookie(req));
    if (!refresh) return authFailure(res, "AUTH_REQUIRED");
    return res.json({ csrfToken: sessionProof(refresh.sessionId) });
  } catch {
    return sessionUnavailable(res);
  }
};

export const discoverCookieSession: RequestHandler = async (req, res) => {
  try {
    // An older access cookie alone cannot confirm a successful refresh.
    const refresh = await getRefreshSession(readRefreshCookie(req));
    if (!req.authSessionId || !refresh?.sessionId.equals(req.authSessionId)) {
      return authFailure(res, "AUTH_REQUIRED");
    }
    return res.json({ user: req.user, refreshGeneration: refresh.generation });
  } catch {
    return sessionUnavailable(res);
  }
};

export const refreshCookieSession: RequestHandler = async (req, res) => {
  const family = readSessionProof(req);
  if (!family) return authFailure(res, "CSRF_REJECTED");
  try {
    const result = await rotateAuthSession(readRefreshCookie(req), family);
    if (result.status === "csrf_mismatch")
      return authFailure(res, "CSRF_REJECTED");
    if (result.status === "conflict")
      return authFailure(res, "REFRESH_CONFLICT");
    if (result.status !== "rotated") return authFailure(res, "AUTH_REQUIRED");
    setSessionCookies(res, result.credentials);
    return res.sendStatus(204);
  } catch {
    return sessionUnavailable(res);
  }
};

export const logoutCookieSession: RequestHandler = async (req, res) => {
  const family = readSessionProof(req);
  if (!family) return authFailure(res, "CSRF_REJECTED");
  try {
    const access = readAccessCookie(req);
    const refresh = readRefreshCookie(req);
    if (access.status === "valid" && !family.equals(access.sessionId)) {
      return authFailure(res, "CSRF_REJECTED");
    }
    if (refresh) {
      if (!(await revokeRefreshSession(refresh, family))) {
        return authFailure(res, "CSRF_REJECTED");
      }
    } else if (access.status === "valid") {
      await revokeAuthSession(access.accountId, access.sessionId);
    }
    clearSessionCookies(res);
    return res.sendStatus(204);
  } catch {
    return sessionUnavailable(res);
  }
};
