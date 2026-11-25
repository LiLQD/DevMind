import Account from "../models/Account.ts";
import type { RequestHandler } from "express";
import bcrypt from "bcrypt";
import { startCookieSession } from "./cookie-auth.controller.ts";
import { sessionUnavailable } from "../middleware/cookie-auth.middleware.ts";

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

export const register: RequestHandler = async (req, res) => {
  try {
    const credentials: Credentials & { name?: unknown } = req.body ?? {};
    const { name } = credentials;
    if (
      !validCredentials(credentials) ||
      typeof name !== "string" ||
      !name.trim()
    ) {
      return res
        .status(400)
        .json({ message: "Enter a name, email, and password." });
    }

    const { email, password } = credentials;
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
    if (!account || account.isActive === false) {
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
