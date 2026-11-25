import { env } from "./env.ts";

function browserOrigins(raw: string | undefined) {
  const entries = raw?.split(",").map((value) => value.trim()) ?? [];
  if (!entries.length || entries.includes("")) {
    throw new Error("COOKIE_AUTH_ORIGINS must list exact browser origins.");
  }
  const urls = entries.map((origin) => {
    try {
      const url = new URL(origin);
      const local =
        env.NODE_ENV !== "production" &&
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      if (url.origin === origin && (url.protocol === "https:" || local))
        return url;
    } catch {
      // Report a fixed configuration error without echoing input.
    }
    throw new Error(
      "COOKIE_AUTH_ORIGINS must list exact HTTPS or development loopback origins.",
    );
  });
  const secure = urls.every((url) => url.protocol === "https:");
  if (!secure && urls.some((url) => url.protocol === "https:")) {
    throw new Error("COOKIE_AUTH_ORIGINS must use one cookie security mode.");
  }
  return { origins: new Set(entries), secure };
}

function readCookieAuthConfig() {
  const jwtSecret = process.env.COOKIE_AUTH_JWT_SECRET?.trim();
  const csrfSecret = process.env.COOKIE_AUTH_CSRF_SECRET?.trim();
  if (
    !jwtSecret ||
    !csrfSecret ||
    jwtSecret.length < 32 ||
    csrfSecret.length < 32 ||
    jwtSecret === csrfSecret
  ) {
    throw new Error(
      "Cookie auth requires distinct JWT and CSRF secrets of at least 32 characters.",
    );
  }
  return {
    ...browserOrigins(process.env.COOKIE_AUTH_ORIGINS),
    jwtSecret,
    csrfSecret,
  };
}

export const cookieAuth = readCookieAuthConfig();
