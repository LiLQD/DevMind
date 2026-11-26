import express from "express";
import { registrationEmailLimiter } from "../middleware/rateLimiter.ts";
import {
  register,
  login,
  registrationStatus,
  requestRegistrationEmail,
} from "../controllers/auth.controller.ts";
import {
  bootstrapCsrf,
  discoverCookieSession,
  logoutCookieSession,
  refreshCookieSession,
} from "../controllers/cookie-auth.controller.ts";
import {
  protectCookie,
  requireCredentialProof,
} from "../middleware/cookie-auth.middleware.ts";

import {
  github,
  google,
  signInMethods,
} from "../controllers/oauth.controller.ts";

const router = express.Router();

router.get("/csrf", bootstrapCsrf);
router.get("/register/status", registrationStatus);
router.post(
  "/register/email",
  requireCredentialProof,
  registrationEmailLimiter,
  requestRegistrationEmail,
);
router.post("/register", requireCredentialProof, register);
router.post("/login", requireCredentialProof, login);
router.get("/session", protectCookie, discoverCookieSession);
router.post("/refresh", refreshCookieSession);
router.post("/logout", logoutCookieSession);

router.get("/methods", protectCookie, signInMethods);
for (const [provider, handlers] of Object.entries({ google, github })) {
  router.get(`/${provider}/status`, handlers.availability);
  router.post(
    `/${provider}/sign-in`,
    handlers.requireProvider,
    requireCredentialProof,
    handlers.start("sign-in"),
  );
  router.post(
    `/${provider}/connect`,
    handlers.requireProvider,
    protectCookie,
    handlers.start("connect"),
  );
  router.get(
    `/${provider}/callback`,
    handlers.requireProvider,
    handlers.callback,
  );
  router.post(
    `/${provider}/finish-sign-in`,
    handlers.requireProvider,
    requireCredentialProof,
    handlers.finish("sign-in"),
  );
  router.post(
    `/${provider}/finish-connect`,
    handlers.requireProvider,
    protectCookie,
    handlers.finish("connect"),
  );
}

export default router;
