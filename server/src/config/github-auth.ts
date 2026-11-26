import { cookieAuth } from "./cookie-auth.ts";

export const githubCallbackPath = "/api/auth/github/callback";

function configuration() {
  if (process.env.GITHUB_AUTH_ENABLED !== "true") return null;
  const clientId = process.env.GITHUB_AUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GITHUB_AUTH_CLIENT_SECRET?.trim();
  const appOrigin = process.env.GITHUB_AUTH_APP_ORIGIN?.trim();
  const callbackUri = process.env.GITHUB_AUTH_CALLBACK_URI?.trim();
  if (
    !clientId ||
    !clientSecret ||
    !appOrigin ||
    !cookieAuth.origins.has(appOrigin) ||
    callbackUri !== appOrigin + githubCallbackPath
  ) {
    console.error(
      "GitHub sign-in is disabled because its credentials, application origin, or callback URI are misconfigured.",
    );
    return null;
  }
  return { clientId, clientSecret, appOrigin, callbackUri };
}

export const githubAuth = configuration();
