import Account from "../models/Account.ts";
import type { RequestHandler } from "express";
import bcrypt from "bcrypt";
import { startCookieSession } from "./cookie-auth.controller.ts";
import { sessionUnavailable } from "../middleware/cookie-auth.middleware.ts";
import {
  normalizeRegistrationEmail,
  registrationEmail,
} from "../config/registration-email.ts";
import {
  consumeRegistrationToken,
  reserveRegistrationEmail,
  sendRegistrationEmail,
} from "../services/registration-email.service.ts";

type Credentials = { email?: unknown; password?: unknown };

function validCredentials(
  credentials: Credentials,
): credentials is { email: string; password: string } {
  const { email, password } = credentials;
  return (
    typeof email === "string" &&
    Boolean(email.trim()) &&
    typeof password === "string" &&
    password.length > 0
  );
}

function isDuplicateKey(error: unknown) {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === 11000
  );
}

export const registrationStatus: RequestHandler = (_req, res) => {
  res.json({ emailVerificationRequired: Boolean(registrationEmail) });
};

export const requestRegistrationEmail: RequestHandler = async (req, res) => {
  if (!registrationEmail) return res.sendStatus(404);
  if (req.get("Origin") !== registrationEmail.appOrigin)
    return res.sendStatus(403);
  const email = normalizeRegistrationEmail(req.body?.email);
  if (!email)
    return res.status(400).json({ message: "Enter a valid email address." });

  try {
    const available = await reserveRegistrationEmail(email);
    if (!available) {
      res.set("Retry-After", "60");
      return res.status(429).json({
        message: "Wait a minute before requesting another verification email.",
      });
    }
    if (!(await Account.exists({ email }))) await sendRegistrationEmail(email);
    return res.status(202).json({ accepted: true });
  } catch {
    console.error("Registration email request failed.");
    return res.status(503).json({
      code: "REGISTRATION_EMAIL_UNAVAILABLE",
      message: "Could not send the verification email. Try again in a minute.",
    });
  }
};

export const register: RequestHandler = async (req, res) => {
  try {
    const {
      email: submittedEmail,
      name,
      password,
      verificationToken,
    }: {
      email?: unknown;
      name?: unknown;
      password?: unknown;
      verificationToken?: unknown;
    } = req.body ?? {};
    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof password !== "string" ||
      !password
    ) {
      return res
        .status(400)
        .json({ message: "Enter a name, email, and password." });
    }

    let email: string;
    if (registrationEmail) {
      if (req.get("Origin") !== registrationEmail.appOrigin)
        return res.sendStatus(403);
      const verifiedEmail = await consumeRegistrationToken(verificationToken);
      if (!verifiedEmail)
        return res.status(400).json({
          code: "REGISTRATION_EMAIL_VERIFICATION_REQUIRED",
          message:
            "This verification link is missing, expired, or already used. Request a new link.",
        });
      email = verifiedEmail;
    } else {
      if (typeof submittedEmail !== "string" || !submittedEmail.trim())
        return res
          .status(400)
          .json({ message: "Enter a name, email, and password." });
      email = submittedEmail;
    }
    // Keep the raw email value for Mongoose's existing query casting.
    const existing = await Account.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "Email đã tồn tại" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const account = new Account({
      email,
      password: hashedPassword,
      name,
      role: "user",
      ...(registrationEmail ? { emailVerifiedAt: new Date() } : {}),
    });

    await account.save();

    return await startCookieSession(
      res,
      {
        id: account._id,
        email: account.email,
        name: account.name,
        role: account.role,
      },
      201,
    );
  } catch (error) {
    if (isDuplicateKey(error))
      return res.status(400).json({ message: "Email đã tồn tại" });
    return sessionUnavailable(res);
  }
};

export const login: RequestHandler = async (req, res) => {
  try {
    const credentials: Credentials = req.body ?? {};
    if (!validCredentials(credentials)) {
      return res.status(400).json({ message: "Enter an email and password." });
    }

    const { email, password } = credentials;
    const account = await Account.findOne({ email });
    if (!account || !account.password || account.isActive === false) {
      return res
        .status(401)
        .json({ message: "Email hoặc mật khẩu không đúng" });
    }

    const valid = await bcrypt.compare(password, account.password);
    if (!valid) {
      return res
        .status(401)
        .json({ message: "Email hoặc mật khẩu không đúng" });
    }

    return await startCookieSession(
      res,
      {
        id: account._id,
        email: account.email,
        name: account.name,
        role: account.role,
      },
      200,
    );
  } catch {
    return sessionUnavailable(res);
  }
};

export const getProfile: RequestHandler = async (req, res) => {
  try {
    const account = await Account.findById(req.user!.id).select("-password");
    res.json(account);
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ message: "Lỗi lấy thông tin" });
  }
};

export const updateProfile: RequestHandler = async (req, res) => {
  try {
    const { name }: { name?: unknown } = req.body;
    const account = await Account.findByIdAndUpdate(
      req.user!.id,
      { name },
      { new: true },
    ).select("-password");
    res.json(account);
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ message: "Cập nhật thất bại" });
  }
};
