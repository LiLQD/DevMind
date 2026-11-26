import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { isObjectIdOrHexString, Types } from "mongoose";
import { githubAuth } from "../config/github-auth.ts";
import type { OAuthProvider } from "./oauth-account.service.ts";
import { googleAuth } from "../config/google-auth.ts";
import { cookieAuth } from "../config/cookie-auth.ts";
import type { createAuthSession } from "./auth-session.service.ts";

const issuer = "devmind";
const audience = "devmind-browser";
const proofLifetimeSeconds = 10 * 60;
const noncePattern = /^[A-Za-z0-9_-]{43}$/;
const idPattern = /^[a-f0-9]{24}$/;
const options = {
  path: "/",
  httpOnly: true,
  secure: cookieAuth.secure,
  sameSite: "lax" as const,
};
const prefix = options.secure ? "__Host-devmind-" : "devmind-";
const accessName = `${prefix}access`;
const refreshName = `${prefix}refresh`;
const bindingName = (provider: OAuthProvider) => `${prefix}${provider}`;
const preAuthName = `${prefix}csrf`;

function readCookie(req: Request, name: string) {
  const field = `${name}=`;
  const matches = req.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(field));
  return matches?.length === 1 ? matches[0].slice(field.length) : undefined;
}

export function readOAuthBinding(req: Request, provider: OAuthProvider) {
  const value = readCookie(req, bindingName(provider));
  return value && noncePattern.test(value) ? value : undefined;
}

export function setOAuthBinding(
  res: Response,
  provider: OAuthProvider,
  binding: string,
  maxAge: number,
) {
  res.cookie(bindingName(provider), binding, { ...options, maxAge });
}

export function clearOAuthBinding(res: Response, provider: OAuthProvider) {
  res.clearCookie(bindingName(provider), options);
}

export function readRefreshCookie(req: Request) {
  return readCookie(req, refreshName);
}

export function readAccessCookie(req: Request) {
  const token = readCookie(req, accessName);
  if (!token) return { status: "missing" } as const;
  try {
    const claims = jwt.verify(token, cookieAuth.jwtSecret, {
      algorithms: ["HS256"],
      issuer,
      audience,
    });
    if (
      typeof claims === "object" &&
      typeof claims.sub === "string" &&
      isObjectIdOrHexString(claims.sub) &&
      typeof claims.sid === "string" &&
      isObjectIdOrHexString(claims.sid) &&
      typeof claims.exp === "number"
    ) {
      return {
        status: "valid",
        accountId: new Types.ObjectId(claims.sub),
        sessionId: new Types.ObjectId(claims.sid),
      } as const;
    }
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError)
      return { status: "expired" } as const;
  }
  return { status: "invalid" } as const;
}

export function setSessionCookies(
  res: Response,
  credentials: NonNullable<Awaited<ReturnType<typeof createAuthSession>>>,
) {
  const access = jwt.sign(
    {
      sid: credentials.sessionId.toHexString(),
      exp: Math.floor(credentials.accessExpiresAt.getTime() / 1000),
    },
    cookieAuth.jwtSecret,
    {
      algorithm: "HS256",
      issuer,
      audience,
      subject: credentials.accountId.toHexString(),
    },
  );
  res.cookie(accessName, access, {
    ...options,
    expires: credentials.accessExpiresAt,
  });
  res.cookie(refreshName, credentials.refreshToken, {
    ...options,
    expires: credentials.refreshExpiresAt,
  });
}

export function clearOAuthBindings(res: Response) {
  if (googleAuth) clearOAuthBinding(res, "google");
  if (githubAuth) clearOAuthBinding(res, "github");
}

export function clearSessionCookies(res: Response) {
  clearOAuthBindings(res);
  res.clearCookie(accessName, options);
  res.clearCookie(refreshName, options);
}

type ProofScope = "credentials" | "session";
function signProof(scope: ProofScope, binding: string, expiry: string) {
  return createHmac("sha256", cookieAuth.csrfSecret)
    .update(`${scope}:${binding}:${expiry}`)
    .digest("base64url");
}

function newProof(scope: ProofScope, binding: string) {
  const expiry = String(Math.floor(Date.now() / 1000) + proofLifetimeSeconds);
  return `${expiry}.${signProof(scope, binding, expiry)}`;
}

function matchesProof(scope: ProofScope, binding: string, proof: string) {
  const [expiry, signature, ...extra] = proof.split(".");
  if (
    extra.length ||
    !/^\d{1,12}$/.test(expiry) ||
    !signature ||
    !noncePattern.test(signature) ||
    Number(expiry) <= Math.floor(Date.now() / 1000)
  )
    return false;
  return timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(signProof(scope, binding, expiry)),
  );
}

export function credentialProof(res: Response) {
  const binding = randomBytes(32).toString("base64url");
  res.cookie(preAuthName, binding, {
    ...options,
    maxAge: proofLifetimeSeconds * 1000,
  });
  return newProof("credentials", binding);
}

export function hasCredentialProof(req: Request) {
  const binding = readCookie(req, preAuthName);
  const proof = req.get("X-DevMind-CSRF");
  return Boolean(
    binding &&
    noncePattern.test(binding) &&
    proof &&
    matchesProof("credentials", binding, proof),
  );
}

export function clearCredentialProof(res: Response) {
  res.clearCookie(preAuthName, options);
}

export function sessionProof(id: Types.ObjectId) {
  const binding = id.toHexString();
  return `${binding}.${newProof("session", binding)}`;
}

export function readSessionProof(req: Request) {
  const proof = req.get("X-DevMind-CSRF") ?? "";
  const binding = proof.slice(0, 24);
  if (
    !idPattern.test(binding) ||
    proof[24] !== "." ||
    !matchesProof("session", binding, proof.slice(25))
  )
    return null;
  return new Types.ObjectId(binding);
}
