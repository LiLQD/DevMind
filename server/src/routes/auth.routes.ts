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

const router = express.Router();

router.get("/csrf", bootstrapCsrf);
router.post("/register", requireCredentialProof, register);
router.post("/login", requireCredentialProof, login);
router.get("/session", protectCookie, discoverCookieSession);
router.post("/refresh", refreshCookieSession);
router.post("/logout", logoutCookieSession);

export default router;
