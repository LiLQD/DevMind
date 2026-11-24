import type { Request, RequestHandler, Response } from "express";
import { cookieAuth } from "../config/cookie-auth.ts";
import {
  getRefreshSession,
  getSessionAccount,
} from "../services/auth-session.service.ts";
import {
  hasCredentialProof,
  readAccessCookie,
  readRefreshCookie,
  readSessionProof,
} from "../services/auth-cookies.ts";

const authErrors = {
  AUTH_REQUIRED: [401, "Sign in to continue."],
  ACCESS_EXPIRED: [401, "The access session expired."],
  SESSION_CHANGED: [401, "The browser session changed."],
  CSRF_REJECTED: [403, "The request could not be verified."],
  REFRESH_CONFLICT: [409, "The session changed. Check its current state."],
  SESSION_UNAVAILABLE: [503, "Authentication is temporarily unavailable."],
} as const;

export function authFailure(res: Response, code: keyof typeof authErrors) {
  const [status, message] = authErrors[code];
  return res.status(status).json({ code, message });
}

export function sessionUnavailable(res: Response) {
  console.error("Cookie authentication failed.");
  return authFailure(res, "SESSION_UNAVAILABLE");
}

function isSafeMethod(method: string) {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

// A request origin is compared to configuration rather than forwarded headers.
export const requireCookieOrigin: RequestHandler = (req, res, next) => {
  if (
    !isSafeMethod(req.method) &&
    !cookieAuth!.origins.has(req.get("Origin") ?? "")
  ) {
    return authFailure(res, "CSRF_REJECTED");
  }
  next();
};

export function canBootstrapProof(req: Request) {
  const origin = req.get("Origin");
  const fetchSite = req.get("Sec-Fetch-Site");
  return (
    req.get("X-DevMind-CSRF") === "bootstrap" &&
    (!origin || cookieAuth!.origins.has(origin)) &&
    (!fetchSite || fetchSite === "same-origin")
  );
}

export const requireCredentialProof: RequestHandler = (req, res, next) => {
  if (!hasCredentialProof(req)) return authFailure(res, "CSRF_REJECTED");
  next();
};

export const protectCookie: RequestHandler = async (req, res, next) => {
  try {
    const access = readAccessCookie(req);
    const expectedSession = req.get("X-DevMind-Session");
    if (access.status !== "valid") {
      const refresh =
        access.status === "invalid"
          ? null
          : await getRefreshSession(readRefreshCookie(req));
      if (
        expectedSession &&
        refresh &&
        !refresh.sessionId.equals(expectedSession)
      ) {
        return authFailure(res, "SESSION_CHANGED");
      }
      return authFailure(res, refresh ? "ACCESS_EXPIRED" : "AUTH_REQUIRED");
    }
    if (expectedSession && !access.sessionId.equals(expectedSession)) {
      return authFailure(res, "SESSION_CHANGED");
    }
    const account = await getSessionAccount(access.accountId, access.sessionId);
    if (!account) return authFailure(res, "AUTH_REQUIRED");
    if (
      !isSafeMethod(req.method) &&
      !readSessionProof(req)?.equals(access.sessionId)
    ) {
      return authFailure(res, "CSRF_REJECTED");
    }
    req.user = account;
    req.authSessionId = access.sessionId;
  } catch {
    return sessionUnavailable(res);
  }
  next();
};
