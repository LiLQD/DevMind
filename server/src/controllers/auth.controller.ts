import Account from "../models/Account.ts";
import type { RequestHandler } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { env } from "../config/env.ts";
import { cookieAuth } from "../config/cookie-auth.ts";
import { startCookieSession } from "./cookie-auth.controller.ts";
import { sessionUnavailable } from "../middleware/cookie-auth.middleware.ts";

type Credentials = { email?: unknown; password?: unknown };

function validCredentials(email: unknown, password: unknown) {
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
    const { email, password, name }: Credentials & { name?: unknown } =
      cookieAuth ? (req.body ?? {}) : req.body;
    if (
      cookieAuth &&
      (!validCredentials(email, password) ||
        typeof name !== "string" ||
        !name.trim())
    ) {
      return res
        .status(400)
        .json({ message: "Enter a name, email, and password." });
    }

    // Keep the raw email value for Mongoose's existing query casting.
    const existing = await Account.findOne({
      email: email as string | undefined,
    });
    if (existing) {
      return res.status(400).json({ message: "Email đã tồn tại" });
    }

    const salt = await bcrypt.genSalt(10);
    if (typeof password !== "string" && !Buffer.isBuffer(password)) {
      throw new TypeError("Password must be a string or Buffer.");
    }
    const hashedPassword = await bcrypt.hash(password, salt);

    const account = new Account({
      email,
      password: hashedPassword,
      name,
      role: "user",
    });

    await account.save();

    if (cookieAuth) {
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
    }

    const token = jwt.sign(
      { id: account._id, role: account.role },
      env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.status(201).json({
      token,
      user: {
        id: account._id,
        email: account.email,
        name: account.name,
        role: account.role,
      },
    });
  } catch (error) {
    if (cookieAuth) {
      if (isDuplicateKey(error))
        return res.status(400).json({ message: "Email đã tồn tại" });
      return sessionUnavailable(res);
    }
    console.error("Register error:", error);
    res.status(500).json({ message: "Đăng ký thất bại" });
  }
};

export const login: RequestHandler = async (req, res) => {
  try {
    const { email, password }: Credentials = cookieAuth
      ? (req.body ?? {})
      : req.body;
    if (cookieAuth && !validCredentials(email, password)) {
      return res.status(400).json({ message: "Enter an email and password." });
    }

    const account = await Account.findOne({
      email: email as string | undefined,
    });
    if (!account || (cookieAuth && account.isActive === false)) {
      return res
        .status(401)
        .json({ message: "Email hoặc mật khẩu không đúng" });
    }

    if (typeof password !== "string" && !Buffer.isBuffer(password)) {
      throw new TypeError("Password must be a string or Buffer.");
    }
    const valid = await bcrypt.compare(password, account.password);
    if (!valid) {
      return res
        .status(401)
        .json({ message: "Email hoặc mật khẩu không đúng" });
    }

    if (cookieAuth) {
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
    }

    const token = jwt.sign(
      { id: account._id, role: account.role },
      env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.json({
      token,
      user: {
        id: account._id,
        email: account.email,
        name: account.name,
        role: account.role,
      },
    });
  } catch (error) {
    if (cookieAuth) return sessionUnavailable(res);
    console.error("Login error:", error);
    res.status(500).json({ message: "Đăng nhập thất bại" });
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
