import { createHash, randomBytes } from "node:crypto";
import type { Types } from "mongoose";
import { authSessionPolicy } from "../config/auth-session.ts";
import Account from "../models/Account.ts";
import AuthSession from "../models/AuthSession.ts";

// Bound the embedded history without dropping evidence of consumed tokens.
const maxRefreshRotations = 8192;
const refreshTokenPattern = /^[A-Za-z0-9_-]{43}$/;

type SessionIdentity = {
  _id: Types.ObjectId;
  accountId: Types.ObjectId;
  generation: number;
  expiresAt: Date;
};

function hashRefreshToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function presentedTokenHash(token: unknown) {
  return typeof token === "string" && refreshTokenPattern.test(token)
    ? hashRefreshToken(token)
    : null;
}

function generateRefreshToken() {
  return randomBytes(32).toString("base64url");
}

function liveSessionFilter(now = new Date()) {
  return { revokedAt: null, expiresAt: { $gt: now } };
}

async function activeAccount(accountId: Types.ObjectId) {
  const account = await Account.findById(accountId)
    .select("email role isActive +sessionVersion")
    .lean();
  return account && account.isActive !== false ? account : null;
}

function describeSession(session: SessionIdentity) {
  return {
    sessionId: session._id,
    accountId: session.accountId,
    generation: session.generation,
    refreshExpiresAt: session.expiresAt,
  };
}

function credentials(
  session: SessionIdentity,
  refreshToken: string,
  now: Date,
) {
  const accessDeadline =
    now.getTime() + authSessionPolicy.accessLifetimeSeconds * 1000;
  return {
    ...describeSession(session),
    refreshToken,
    accessExpiresAt: new Date(
      Math.min(accessDeadline, session.expiresAt.getTime()),
    ),
  };
}

type RotationResult =
  | { status: "rotated"; credentials: ReturnType<typeof credentials> }
  | { status: "invalid" | "reused" | "conflict" | "rotation_limit" };

export async function createAuthSession(accountId: Types.ObjectId) {
  const account = await activeAccount(accountId);
  if (!account) return null;

  await AuthSession.init();
  const now = new Date();
  const refreshToken = generateRefreshToken();
  const session = await AuthSession.create({
    accountId,
    accountVersion: account.sessionVersion ?? 0,
    currentTokenHash: hashRefreshToken(refreshToken),
    createdAt: now,
    expiresAt: new Date(
      now.getTime() + authSessionPolicy.refreshLifetimeSeconds * 1000,
    ),
  });
  return credentials(session, refreshToken, now);
}

// Probe the current cookie after a lost response without rotating or consuming it.
export async function getRefreshSession(refreshToken: unknown) {
  const tokenHash = presentedTokenHash(refreshToken);
  if (!tokenHash) return null;

  const session = await AuthSession.findOne({
    ...liveSessionFilter(),
    currentTokenHash: tokenHash,
  }).lean();
  if (!session) return null;

  const account = await activeAccount(session.accountId);
  if (
    !account ||
    session.expiresAt.getTime() <= Date.now() ||
    (account.sessionVersion ?? 0) !== session.accountVersion
  ) {
    return null;
  }
  return describeSession(session);
}

export async function rotateAuthSession(
  refreshToken: unknown,
): Promise<RotationResult> {
  const tokenHash = presentedTokenHash(refreshToken);
  if (!tokenHash) return { status: "invalid" };
  const observed = await AuthSession.findOne({
    ...liveSessionFilter(),
    $or: [{ currentTokenHash: tokenHash }, { consumedTokenHashes: tokenHash }],
  })
    .select("+currentTokenHash")
    .lean();
  if (!observed) return { status: "invalid" };

  const account = await activeAccount(observed.accountId);
  if (!account || (account.sessionVersion ?? 0) !== observed.accountVersion) {
    return { status: "invalid" };
  }

  const now = new Date();
  const family = { _id: observed._id, ...liveSessionFilter(now) };
  if (observed.currentTokenHash !== tokenHash) {
    await AuthSession.updateOne(
      { ...family, consumedTokenHashes: tokenHash },
      { $set: { revokedAt: now, revocationReason: "reuse" } },
    );
    return { status: "reused" };
  }
  if (observed.generation >= maxRefreshRotations) {
    return { status: "rotation_limit" };
  }

  const successor = generateRefreshToken();
  const result = await AuthSession.updateOne(
    { ...family, generation: observed.generation, currentTokenHash: tokenHash },
    {
      $set: { currentTokenHash: hashRefreshToken(successor), rotatedAt: now },
      $push: { consumedTokenHashes: tokenHash },
      $inc: { generation: 1 },
    },
  );
  // A request that observed the active generation can lose a concurrent write.
  if (result.modifiedCount !== 1) return { status: "conflict" };
  return {
    status: "rotated",
    credentials: credentials(
      { ...observed, generation: observed.generation + 1 },
      successor,
      now,
    ),
  };
}

export async function getSessionAccount(
  accountId: Types.ObjectId,
  sessionId: Types.ObjectId,
) {
  const [session, account] = await Promise.all([
    AuthSession.findOne({
      _id: sessionId,
      accountId,
      ...liveSessionFilter(),
    })
      .select("accountVersion expiresAt")
      .lean(),
    activeAccount(accountId),
  ]);
  if (
    !session ||
    !account ||
    session.expiresAt.getTime() <= Date.now() ||
    session.accountVersion !== (account.sessionVersion ?? 0)
  ) {
    return null;
  }
  return { id: account._id, email: account.email, role: account.role };
}

export async function revokeAuthSession(
  accountId: Types.ObjectId,
  sessionId: Types.ObjectId,
) {
  await AuthSession.updateOne(
    { _id: sessionId, accountId, revokedAt: null },
    { $set: { revokedAt: new Date(), revocationReason: "logout" } },
  );
}

// Password and deactivation writes should increment this version in the same
// account update when those flows are wired to cookie sessions.
export async function revokeAccountSessions(accountId: Types.ObjectId) {
  await Account.updateOne(
    { _id: accountId },
    { $inc: { sessionVersion: 1 } },
    { writeConcern: { w: "majority" } },
  );
}
