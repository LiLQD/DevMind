import { cookieAuth } from "./cookie-auth.ts";

export const googleCallbackPath = "/api/auth/google/callback";

function configuration() {
  if (process.env.GOOGLE_AUTH_ENABLED !== "true") return null;
  const clientId = process.env.GOOGLE_AUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_AUTH_CLIENT_SECRET?.trim();
  const appOrigin = process.env.GOOGLE_AUTH_APP_ORIGIN?.trim();
  const callbackUri = process.env.GOOGLE_AUTH_CALLBACK_URI?.trim();
  if (
    !clientId ||
    !clientSecret ||
    !appOrigin ||
    !cookieAuth.origins.has(appOrigin) ||
    callbackUri !== appOrigin + googleCallbackPath
  ) {
    console.error(
      "Google sign-in is disabled because its credentials, application origin, or callback URI are misconfigured.",
    );
    return null;
  }
  return { clientId, clientSecret, appOrigin, callbackUri };
}

export const googleAuth = configuration();
