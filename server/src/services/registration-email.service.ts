import { createHash, randomBytes } from "node:crypto";
import redis from "../config/redis.ts";
import { registrationEmail } from "../config/registration-email.ts";

const tokenTtlSeconds = 15 * 60;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const tokenKey = (token: string) =>
  `devmind:registration:token:${digest(token)}`;

export async function reserveRegistrationEmail(email: string) {
  return (
    (await redis.set(
      `devmind:registration:send:${digest(email)}`,
      "1",
      "EX",
      60,
      "NX",
    )) === "OK"
  );
}

export async function sendRegistrationEmail(email: string) {
  if (!registrationEmail) throw new Error("Email verification is disabled");
  const token = randomBytes(32).toString("base64url");
  await redis.set(tokenKey(token), email, "EX", tokenTtlSeconds);
  const link = new URL("/", registrationEmail.appOrigin);
  link.hash = "verify-email=" + token;

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "api-key": registrationEmail.apiKey,
    },
    body: JSON.stringify({
      sender: { name: "DevMind", email: registrationEmail.sender },
      to: [{ email }],
      subject: "Verify your email for DevMind",
      textContent: [
        "Open this link to finish creating your DevMind account:",
        link.href,
        "The link expires in 15 minutes. If you did not request this email, you can ignore it.",
      ].join("\n\n"),
    }),
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Registration email delivery failed");
}

export async function consumeRegistrationToken(token: unknown) {
  if (typeof token !== "string" || !tokenPattern.test(token)) return null;
  return redis.getdel(tokenKey(token));
}
