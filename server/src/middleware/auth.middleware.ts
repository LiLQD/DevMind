import type { RequestHandler } from "express";
import type { HydratedDocument, InferSchemaType } from "mongoose";
import Account from "../models/Account.ts";
import type { Types } from "mongoose";

type AccountDocument = HydratedDocument<InferSchemaType<typeof Account.schema>>;

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: AccountDocument["_id"];
        email: AccountDocument["email"];
        role: AccountDocument["role"];
        name?: string;
      };
      authSessionId?: Types.ObjectId;
    }
  }
}

export { protectCookie as protect } from "./cookie-auth.middleware.ts";

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
