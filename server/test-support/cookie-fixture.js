export const testOrigin = "https://devmind.example.test";
const csrfHeader = "X-DevMind-CSRF";

export function configureTestCookies() {
  Object.assign(process.env, {
    COOKIE_AUTH_ORIGINS: testOrigin,
    COOKIE_AUTH_JWT_SECRET: "synthetic-test-cookie-signing-key",
    COOKIE_AUTH_CSRF_SECRET: "synthetic-test-cookie-csrf-signing-key",
  });
}

function cookies(response) {
  return response.headers["set-cookie"]
    .filter((header) => !header.startsWith("__Host-devmind-csrf=;"))
    .map((header) => header.split(";")[0])
    .join("; ");
}

export async function submitCredentials(client, action, payload, status) {
  const bootstrap = await client
    .get("/api/auth/csrf?purpose=credentials")
    .set(csrfHeader, "bootstrap")
    .expect(200);
  return client
    .post(`/api/auth/${action}`)
    .set("Origin", testOrigin)
    .set("Cookie", cookies(bootstrap))
    .set(csrfHeader, bootstrap.body.csrfToken)
    .send(payload)
    .expect(status);
}

export async function sessionHeaders(client, response) {
  const cookie = cookies(response);
  const { body } = await client
    .get("/api/auth/csrf")
    .set("Cookie", cookie)
    .set(csrfHeader, "bootstrap")
    .expect(200);
  return { Cookie: cookie, Origin: testOrigin, [csrfHeader]: body.csrfToken };
}
