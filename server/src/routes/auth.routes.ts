import express from "express";
import { register, login } from "../controllers/auth.controller.ts";
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
  finishGoogle,
  googleAvailability,
  googleCallback,
  requireGoogle,
  signInMethods,
  startGoogle,
} from "../controllers/google-auth.controller.ts";

const router = express.Router();

router.get("/csrf", bootstrapCsrf);
router.post("/register", requireCredentialProof, register);
router.post("/login", requireCredentialProof, login);
router.get("/session", protectCookie, discoverCookieSession);
router.post("/refresh", refreshCookieSession);
router.post("/logout", logoutCookieSession);

router.get("/google/status", googleAvailability);
router.get("/methods", protectCookie, signInMethods);
router.post(
  "/google/sign-in",
  requireGoogle,
  requireCredentialProof,
  startGoogle("sign-in"),
);
router.post(
  "/google/connect",
  requireGoogle,
  protectCookie,
  startGoogle("connect"),
);
router.get("/google/callback", requireGoogle, googleCallback);
router.post(
  "/google/finish-sign-in",
  requireGoogle,
  requireCredentialProof,
  finishGoogle("sign-in"),
);
router.post(
  "/google/finish-connect",
  requireGoogle,
  protectCookie,
  finishGoogle("connect"),
);

export default router;
