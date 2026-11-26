import type { Request, RequestHandler, Response } from "express";
import {
  randomState,
  randomNonce,
  randomPKCECodeVerifier,
} from "openid-client";
import { googleAuth } from "../config/google-auth.ts";
import redis from "../config/redis.ts";
import Account from "../models/Account.ts";
import AuthSession from "../models/AuthSession.ts";
import {
  googleAuthorization,
  verifyGoogleIdentity,
} from "../services/google-oidc.service.ts";
import {
  connectGoogleAccount,
  findOrCreateGoogleAccount,
} from "../services/google-account.service.ts";
import {
  getRefreshSession,
  getSessionAccount,
} from "../services/auth-session.service.ts";
import {
  clearGoogleBinding,
  readAccessCookie,
  readGoogleBinding,
  readRefreshCookie,
  setGoogleBinding,
} from "../services/auth-cookies.ts";
import { startCookieSession } from "./cookie-auth.controller.ts";

type Mode = "sign-in" | "connect";
type LinkSession = { accountId: string; sessionId: string };
type Transaction = {
  mode: Mode;
  nonce: string;
  verifier: string;
  link?: LinkSession;
};
type Ticket = {
  mode: Mode;
  link?: LinkSession;
  identity: NonNullable<Awaited<ReturnType<typeof verifyGoogleIdentity>>>;
};
const transactionTtl = 300;
const ticketTtl = 60;
const recentAuthMs = 5 * 60_000;
const statePattern = /^[A-Za-z0-9_-]{43}$/;
const transactionKey = (state: string, binding: string) =>
  `devmind:google:transaction:${state}:${binding}`;
const ticketKey = (binding: string) => `devmind:google:verified:${binding}`;

function unavailable(res: Response) {
  return res.status(503).json({
    code: "GOOGLE_UNAVAILABLE",
    message:
      "Google sign-in is temporarily unavailable. Try again or use your password.",
  });
}

function reject(res: Response, code: string, message: string, status = 409) {
  return res.status(status).json({ code, message });
}

export const googleAvailability: RequestHandler = (req, res) => {
  res.json({
    enabled: Boolean(
      googleAuth && req.get("X-DevMind-Origin") === googleAuth.appOrigin,
    ),
  });
};

export const requireGoogle: RequestHandler = (_req, res, next) => {
  if (!googleAuth) return res.sendStatus(404);
  res.set("Referrer-Policy", "no-referrer");
  next();
};

async function hasLiveBrowserSession(req: Request) {
  const access = readAccessCookie(req);
  return Boolean(
    (await getRefreshSession(readRefreshCookie(req))) ||
    (access.status === "valid" &&
      (await getSessionAccount(access.accountId, access.sessionId))),
  );
}

async function recentLink(req: Request) {
  const user = req.user;
  const sessionId = req.authSessionId;
  if (!user || !sessionId) return undefined;
  const refresh = await getRefreshSession(readRefreshCookie(req));
  if (
    !refresh?.sessionId.equals(sessionId) ||
    !refresh.accountId.equals(user.id)
  )
    return undefined;
  const recent = await AuthSession.exists({
    _id: sessionId,
    accountId: user.id,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
    createdAt: { $gte: new Date(Date.now() - recentAuthMs) },
  });
  return recent
    ? { accountId: user.id.toString(), sessionId: sessionId.toString() }
    : undefined;
}

function recentRequired(res: Response) {
  return reject(
    res,
    "GOOGLE_RECENT_AUTH",
    "Sign out and sign back in before connecting Google.",
  );
}

export function startGoogle(mode: Mode): RequestHandler {
  return async (req, res) => {
    try {
      if (req.get("Origin") !== googleAuth!.appOrigin)
        return res.sendStatus(403);
      if (mode === "sign-in" && (await hasLiveBrowserSession(req))) {
        return reject(
          res,
          "GOOGLE_SESSION_CHANGED",
          "A session already exists. Reload DevMind to continue.",
        );
      }
      const link = mode === "connect" ? await recentLink(req) : undefined;
      if (mode === "connect" && !link) return recentRequired(res);

      const state = randomState();
      const binding = randomState();
      const nonce = randomNonce();
      const verifier = randomPKCECodeVerifier();
      const url = await googleAuthorization(state, nonce, verifier);
      await redis.set(
        transactionKey(state, binding),
        JSON.stringify({ mode, link, nonce, verifier }),
        "EX",
        transactionTtl,
      );
      setGoogleBinding(res, binding, transactionTtl * 1000);
      res.json({ url });
    } catch {
      return unavailable(res);
    }
  };
}

export const googleCallback: RequestHandler = async (req, res) => {
  const redirect = (
    status: "sign-in" | "connect" | "cancelled" | "invalid" | "unavailable",
  ) => res.redirect(303, googleAuth!.appOrigin + "/?google=" + status);
  try {
    const binding = readGoogleBinding(req);
    const { state, code, error, iss } = req.query;
    if (!binding || typeof state !== "string" || !statePattern.test(state))
      return redirect("invalid");
    const raw = await redis.getdel(transactionKey(state, binding));
    if (!raw) return redirect("invalid");
    const tx: Transaction = JSON.parse(raw);
    if (error === "access_denied") return redirect("cancelled");
    if (
      error !== undefined ||
      typeof code !== "string" ||
      !code ||
      (iss !== undefined && typeof iss !== "string")
    )
      return redirect("invalid");

    if (tx.mode === "sign-in" && (await hasLiveBrowserSession(req)))
      return redirect("invalid");
    if (tx.mode === "connect") {
      const access = readAccessCookie(req);
      const refresh = await getRefreshSession(readRefreshCookie(req));
      if (
        !tx.link ||
        !refresh ||
        refresh.sessionId.toString() !== tx.link.sessionId ||
        refresh.accountId.toString() !== tx.link.accountId ||
        (access.status === "valid" &&
          !access.sessionId.equals(refresh.sessionId))
      )
        return redirect("invalid");
    }

    const url = new URL(googleAuth!.callbackUri);
    url.searchParams.set("state", state);
    url.searchParams.set("code", code);
    if (iss) url.searchParams.set("iss", iss);
    const identity = await verifyGoogleIdentity(
      url,
      state,
      tx.nonce,
      tx.verifier,
    );
    if (!identity) return redirect("invalid");
    const ticket: Ticket = { mode: tx.mode, link: tx.link, identity };
    await redis.set(
      ticketKey(binding),
      JSON.stringify(ticket),
      "EX",
      ticketTtl,
    );
    return redirect(tx.mode);
  } catch {
    return redirect("unavailable");
  }
};

export function finishGoogle(mode: Mode): RequestHandler {
  return async (req, res) => {
    try {
      if (req.get("Origin") !== googleAuth!.appOrigin)
        return res.sendStatus(403);
      if (mode === "sign-in" && (await hasLiveBrowserSession(req))) {
        return reject(
          res,
          "GOOGLE_SESSION_CHANGED",
          "A session already exists. Reload DevMind to continue.",
        );
      }
      const binding = readGoogleBinding(req);
      const raw = binding && (await redis.getdel(ticketKey(binding)));
      if (!raw)
        return reject(
          res,
          "GOOGLE_EXPIRED",
          "Google sign-in expired. Start again.",
          400,
        );
      clearGoogleBinding(res);
      const ticket: Ticket = JSON.parse(raw);
      if (ticket.mode !== mode) return res.sendStatus(403);

      if (mode === "connect") {
        const link = await recentLink(req);
        if (
          !link ||
          link.accountId !== ticket.link?.accountId ||
          link.sessionId !== ticket.link?.sessionId ||
          !req.user ||
          !req.authSessionId ||
          !(await getSessionAccount(req.user.id, req.authSessionId))
        ) {
          return recentRequired(res);
        }
        if (!(await connectGoogleAccount(req.user.id, ticket.identity.sub))) {
          return reject(
            res,
            "GOOGLE_ALREADY_LINKED",
            "This Google identity cannot be connected to this account.",
          );
        }
        return res.json({ googleConnected: true });
      }

      const account = await findOrCreateGoogleAccount(ticket.identity);
      if (!account) {
        return reject(
          res,
          "GOOGLE_EMAIL_IN_USE",
          "An account already uses this email. Sign in using your existing method, then connect Google from Sign-in methods.",
        );
      }
      if (account.isActive === false)
        return reject(
          res,
          "GOOGLE_ACCOUNT_UNAVAILABLE",
          "This account is unavailable.",
          403,
        );
      return await startCookieSession(
        res,
        {
          id: account._id,
          name: account.name,
          email: account.email,
          role: account.role,
        },
        200,
      );
    } catch {
      return unavailable(res);
    }
  };
}

export const signInMethods: RequestHandler = async (req, res) => {
  const account = await Account.findById(req.user!.id)
    .select("password +identities.google")
    .lean();
  if (!account) return res.sendStatus(404);
  res.json({
    passwordConfigured: Boolean(account.password),
    googleConnected: Boolean(account.identities?.google),
  });
};
