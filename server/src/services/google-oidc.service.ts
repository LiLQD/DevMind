import * as oidc from "openid-client";
import { googleAuth } from "../config/google-auth.ts";

const discoveryUrl = new URL("https://accounts.google.com");
let discovery: Promise<oidc.Configuration> | undefined;

export function googleClient() {
  if (!googleAuth) throw new Error("Google sign-in disabled");
  discovery ??= oidc
    .discovery(
      discoveryUrl,
      googleAuth.clientId,
      { id_token_signed_response_alg: "RS256" },
      oidc.ClientSecretPost(googleAuth.clientSecret),
      { timeout: 5, execute: [oidc.enableNonRepudiationChecks] },
    )
    .then((config) => {
      if (!config.serverMetadata().supportsPKCE("S256")) {
        throw new Error("Google S256 support could not be verified");
      }
      return config;
    })
    .catch((error: unknown) => {
      discovery = undefined;
      throw error;
    });
  return discovery;
}

export async function googleAuthorization(
  state: string,
  nonce: string,
  verifier: string,
) {
  const config = await googleClient();
  return oidc.buildAuthorizationUrl(config, {
    redirect_uri: googleAuth!.callbackUri,
    scope: "openid email profile",
    state,
    nonce,
    code_challenge_method: "S256",
    code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
    prompt: "select_account",
  }).href;
}

export async function verifyGoogleIdentity(
  callback: URL,
  state: string,
  nonce: string,
  verifier: string,
) {
  const config = await googleClient();
  let response;
  try {
    response = await oidc.authorizationCodeGrant(config, callback, {
      expectedState: state,
      expectedNonce: nonce,
      pkceCodeVerifier: verifier,
    });
  } catch (error) {
    if (
      (error instanceof oidc.ClientError &&
        [
          "OAUTH_INVALID_RESPONSE",
          "OAUTH_JWT_TIMESTAMP_CHECK_FAILED",
          "OAUTH_JWT_CLAIM_COMPARISON_FAILED",
          "OAUTH_KEY_SELECTION_FAILED",
        ].includes(error.code ?? "")) ||
      (error instanceof oidc.ResponseBodyError &&
        error.error === "invalid_grant")
    )
      return null;
    throw error;
  }
  const claims = response.claims();
  if (
    !claims ||
    typeof claims.sub !== "string" ||
    !claims.sub ||
    claims.email_verified !== true ||
    typeof claims.email !== "string" ||
    !claims.email.trim()
  )
    return null;

  const email = claims.email.trim().toLowerCase();
  const name =
    typeof claims.name === "string" && claims.name.trim()
      ? claims.name.trim().slice(0, 120)
      : email.split("@")[0];
  return { sub: claims.sub, email, name };
}
