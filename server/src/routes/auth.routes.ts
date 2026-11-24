import express from "express";
import { register, login } from "../controllers/auth.controller.ts";
import { cookieAuth } from "../config/cookie-auth.ts";
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

const router = express.Router();

if (cookieAuth) {
  router.get("/csrf", bootstrapCsrf);
  router.post("/register", requireCredentialProof, register);
  router.post("/login", requireCredentialProof, login);
  router.get("/session", protectCookie, discoverCookieSession);
  router.post("/refresh", refreshCookieSession);
  router.post("/logout", logoutCookieSession);
} else {
  router.post("/register", register);
  router.post("/login", login);
}

export default router;
