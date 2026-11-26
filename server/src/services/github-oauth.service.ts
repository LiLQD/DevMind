import { calculatePKCECodeChallenge } from "openid-client";
import { githubAuth } from "../config/github-auth.ts";
import type { OAuthIdentity } from "./oauth-account.service.ts";

function object(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

export async function githubAuthorization(
  state: string,
  _nonce: string,
  verifier: string,
) {
  if (!githubAuth) throw new Error("GitHub sign-in disabled");
  const url = new URL("https://github.com/login/oauth/authorize");
  url.search = new URLSearchParams({
    client_id: githubAuth.clientId,
    redirect_uri: githubAuth.callbackUri,
    scope: "user:email",
    state,
    code_challenge: await calculatePKCECodeChallenge(verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return url.href;
}

export async function verifyGitHubIdentity(
  callback: URL,
  _state: string,
  _nonce: string,
  verifier: string,
): Promise<OAuthIdentity | null> {
  if (!githubAuth) throw new Error("GitHub sign-in disabled");
  const code = callback.searchParams.get("code");
  if (!code) return null;

  const exchange = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json" },
    body: new URLSearchParams({
      client_id: githubAuth.clientId,
      client_secret: githubAuth.clientSecret,
      code,
      redirect_uri: githubAuth.callbackUri,
      code_verifier: verifier,
    }),
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  if (exchange.status === 400) return null;
  if (!exchange.ok) throw new Error("GitHub token exchange unavailable");
  const token = object(await exchange.json());
  if (
    typeof token?.access_token !== "string" ||
    !token.access_token ||
    typeof token.token_type !== "string" ||
    token.token_type.toLowerCase() !== "bearer"
  )
    return null;

  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token.access_token}`,
    "User-Agent": "DevMind",
  };
  const [profileResponse, emailsResponse] = await Promise.all(
    ["/user", "/user/emails"].map((path) =>
      fetch("https://api.github.com" + path, {
        headers,
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      }),
    ),
  );
  if (!profileResponse.ok || !emailsResponse.ok)
    throw new Error("GitHub identity unavailable");

  const profile = object(await profileResponse.json());
  const emails: unknown = await emailsResponse.json();
  if (
    typeof profile?.id !== "number" ||
    !Number.isSafeInteger(profile.id) ||
    profile.id <= 0 ||
    !Array.isArray(emails)
  )
    return null;

  const primary = emails
    .map(object)
    .find((item) => item?.primary === true && item.verified === true);
  const email =
    typeof primary?.email === "string"
      ? primary.email.trim().toLowerCase()
      : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;

  const name = [profile.name, profile.login].find(
    (value): value is string =>
      typeof value === "string" && Boolean(value.trim()),
  );
  return {
    sub: String(profile.id),
    email,
    name: name?.trim().slice(0, 120) ?? email.split("@")[0],
  };
}
