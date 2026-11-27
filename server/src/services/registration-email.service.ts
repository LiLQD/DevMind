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

  const credentials = Buffer.from(
    registrationEmail.apiKey + ":" + registrationEmail.apiSecret,
  ).toString("base64");
  const response = await fetch("https://api.mailjet.com/v3.1/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: "Basic " + credentials,
    },
    body: JSON.stringify({
      Messages: [
        {
          From: { Name: "DevMind", Email: registrationEmail.sender },
          To: [{ Email: email }],
          Subject: "Verify your email for DevMind",
          TextPart: [
            "Open this link to finish creating your DevMind account:",
            link.href,
            "The link expires in 15 minutes. If you did not request this email, you can ignore it.",
          ].join("\n\n"),
        },
      ],
    }),
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Registration email delivery failed");
  const result: { Messages?: { Status?: string }[] } | null =
    await response.json();
  if (result?.Messages?.[0]?.Status !== "success") {
    throw new Error("Registration email delivery failed");
  }
}

export async function consumeRegistrationToken(token: unknown) {
  if (typeof token !== "string" || !tokenPattern.test(token)) return null;
  return redis.getdel(tokenKey(token));
}
