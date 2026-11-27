import { cookieAuth } from "./cookie-auth.ts";

export function normalizeRegistrationEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? email
    : null;
}

function configuration() {
  if (process.env.EMAIL_VERIFICATION_ENABLED !== "true") return null;
  const appOrigin = process.env.EMAIL_VERIFICATION_APP_ORIGIN?.trim();
  const apiKey = process.env.MAILJET_API_KEY?.trim();
  const apiSecret = process.env.MAILJET_API_SECRET?.trim();
  const sender = normalizeRegistrationEmail(process.env.MAILJET_SENDER_EMAIL);
  if (
    !appOrigin ||
    !cookieAuth.origins.has(appOrigin) ||
    !apiKey ||
    !apiSecret ||
    !sender
  ) {
    throw new Error(
      "Email verification requires a configured browser origin, Mailjet API key and secret, and verified sender.",
    );
  }
  return { appOrigin, apiKey, apiSecret, sender };
}

export const registrationEmail = configuration();
