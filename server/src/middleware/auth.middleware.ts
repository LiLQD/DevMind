import jwt from "jsonwebtoken";
import type { RequestHandler } from "express";
import type { HydratedDocument, InferSchemaType } from "mongoose";
import Account from "../models/Account.ts";
import { env } from "../config/env.ts";

type AccountDocument = HydratedDocument<InferSchemaType<typeof Account.schema>>;

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: AccountDocument["_id"];
        email: AccountDocument["email"];
        role: AccountDocument["role"];
      };
    }
  }
}

export const protect: RequestHandler = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({ message: "Không có token xác thực" });
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    const accountId: unknown =
      typeof decoded === "string" ? undefined : decoded.id;
    const account = await Account.findById(accountId).select("-password");

    if (!account || account.isActive === false) {
      return res.status(401).json({ message: "Token không hợp lệ" });
    }

    req.user = {
      id: account._id,
      email: account.email,
      role: account.role,
    };
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(401).json({ message: "Token không hợp lệ" });
  }
};

// The routers run protect before either role check.
export const admin: RequestHandler = async (req, res, next) => {
  if (req.user!.role !== "admin") {
    return res.status(403).json({ message: "Yêu cầu quyền Admin" });
  }
  next();
};

export const staff: RequestHandler = async (req, res, next) => {
  const { role } = req.user!;
  if (role !== "staff" && role !== "admin") {
    return res.status(403).json({ message: "Yêu cầu quyền Staff" });
  }
  next();
};
