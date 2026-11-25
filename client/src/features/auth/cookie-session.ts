export type CookieSession = {
  sessionId: string;
  user: { id: string; name?: string; email?: string };
};

export const cookieSessionChannel = "devmind-cookie-session";
const csrfHeader = "X-DevMind-CSRF";
const sessionHeader = "X-DevMind-Session";

export class CookieAuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

export function needsCookieSignIn(error: unknown) {
  return (
    error instanceof CookieAuthError &&
    (error.code === "AUTH_REQUIRED" || error.code === "SESSION_CHANGED")
  );
}

function accessExpired(error: unknown) {
  return error instanceof CookieAuthError && error.code === "ACCESS_EXPIRED";
}

function sessionChanged(): never {
  throw new CookieAuthError(
    "Your browser session changed. Sign in again.",
    401,
    "SESSION_CHANGED",
  );
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

async function request(path: string, options?: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      credentials: "same-origin",
    });
  } catch (error) {
    if (options?.signal?.aborted) throw error;
    throw new CookieAuthError(
      "Unable to reach DevMind. Check your connection and try again.",
      0,
    );
  }
  const data: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const body = record(data);
    const details = record(body?.error);
    const message = body?.message ?? details?.message ?? body?.error;
    const code = body?.code ?? details?.code;
    throw new CookieAuthError(
      typeof message === "string"
        ? message
        : "Request failed. Please try again.",
      response.status,
      typeof code === "string" ? code : undefined,
    );
  }
  if (response.status !== 204 && data === undefined) {
    throw new CookieAuthError("DevMind returned an unexpected response.", 502);
  }
  return data;
}

async function discover(expected?: CookieSession, signal?: AbortSignal) {
  const data = record(await request("/auth/session", { signal }));
  const user = record(data?.user);
  if (typeof data?.sessionId !== "string" || typeof user?.id !== "string") {
    throw new CookieAuthError("DevMind returned an unexpected session.", 502);
  }
  const current: CookieSession = {
    sessionId: data.sessionId,
    user: {
      id: user.id,
      name: typeof user.name === "string" ? user.name : undefined,
      email: typeof user.email === "string" ? user.email : undefined,
    },
  };
  if (
    expected &&
    (current.sessionId !== expected.sessionId ||
      current.user.id !== expected.user.id)
  ) {
    sessionChanged();
  }
  return current;
}

let cachedProof: { value: string; family: string; expires: number } | undefined;

async function csrfProof(
  expectedFamily?: string,
  credentials = false,
  signal?: AbortSignal,
) {
  if (
    !credentials &&
    expectedFamily &&
    cachedProof?.family === expectedFamily &&
    cachedProof.expires > Date.now() + 30_000
  )
    return cachedProof.value;

  const data = record(
    await request(
      credentials ? "/auth/csrf?purpose=credentials" : "/auth/csrf",
      {
        headers: { [csrfHeader]: "bootstrap" },
        signal,
      },
    ),
  );
  const proof = data?.csrfToken;
  if (typeof proof !== "string")
    throw new CookieAuthError("DevMind could not verify this request.", 502);
  if (!credentials) {
    const [family, expiry] = proof.split(".");
    if (expectedFamily && expectedFamily !== family) sessionChanged();
    cachedProof = { value: proof, family, expires: Number(expiry) * 1000 };
  }
  return proof;
}

let localQueue: Promise<unknown> = Promise.resolve();
async function withSessionLock<T>(operation: () => Promise<T>): Promise<T> {
  if (navigator.locks)
    return await navigator.locks.request(cookieSessionChannel, operation);
  const pending = localQueue.then(operation, operation);
  localQueue = pending.catch(() => undefined);
  return pending;
}

async function recover(expected?: CookieSession, signal?: AbortSignal) {
  return withSessionLock(async () => {
    signal?.throwIfAborted();
    try {
      return await discover(expected, signal);
    } catch (error) {
      if (!accessExpired(error)) throw error;
    }
    // Request fresh proof for the browser's current refresh cookie under the lock.
    cachedProof = undefined;
    const proof = await csrfProof(expected?.sessionId, false, signal);
    signal?.throwIfAborted();
    try {
      await request("/auth/refresh", {
        method: "POST",
        headers: { [csrfHeader]: proof },
      });
    } catch (error) {
      if (
        !(error instanceof CookieAuthError) ||
        (error.status !== 0 &&
          error.status < 500 &&
          error.code !== "REFRESH_CONFLICT")
      ) {
        throw error;
      }
      // A lost response can follow a commit. Only probe; never replay the refresh.
      try {
        return await discover(expected, signal);
      } catch (probeError) {
        if (needsCookieSignIn(probeError)) throw probeError;
        throw error;
      }
    }
    return discover(expected, signal);
  });
}

export function restoreCookieSession(signal: AbortSignal) {
  return recover(undefined, signal);
}

export function authenticateCookieSession(path: string, payload: object) {
  return withSessionLock(async () => {
    const proof = await csrfProof(undefined, true);
    await request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", [csrfHeader]: proof },
      body: JSON.stringify(payload),
    });
    cachedProof = undefined;
    return discover();
  });
}

export function logoutCookieSession(session: CookieSession) {
  return withSessionLock(async () => {
    const proof = await csrfProof(session.sessionId);
    try {
      await request("/auth/logout", {
        method: "POST",
        headers: { [csrfHeader]: proof },
      });
    } catch (error) {
      try {
        await discover(session);
      } catch (probeError) {
        if (
          probeError instanceof CookieAuthError &&
          probeError.code === "SESSION_CHANGED"
        ) {
          cachedProof = undefined;
          return;
        }
      }
      throw error;
    }
    cachedProof = undefined;
  });
}

let inFlight: { family: string; promise: Promise<CookieSession> } | undefined;
function recoverWorkspace(session: CookieSession, signal: AbortSignal) {
  if (inFlight?.family === session.sessionId) return inFlight.promise;
  const promise = recover(session, signal).finally(() => {
    if (inFlight?.promise === promise) inFlight = undefined;
  });
  inFlight = { family: session.sessionId, promise };
  return promise;
}

export async function cookieWorkspaceRequest(
  session: CookieSession,
  sessionSignal: AbortSignal,
  path: string,
  options: RequestInit,
) {
  const send = async () => {
    sessionSignal.throwIfAborted();
    const headers = new Headers(options.headers);
    headers.set(sessionHeader, session.sessionId);
    const method = options.method ?? "GET";
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      headers.set(
        csrfHeader,
        await csrfProof(session.sessionId, false, sessionSignal),
      );
      sessionSignal.throwIfAborted();
    }
    return request(path, { ...options, headers });
  };

  try {
    return await send();
  } catch (error) {
    if (!accessExpired(error)) throw error;
  }
  await recoverWorkspace(session, sessionSignal);
  // ACCESS_EXPIRED is emitted by the auth guard before the operation runs.
  return send();
}
