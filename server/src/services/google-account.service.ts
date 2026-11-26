import type { Types } from "mongoose";
import { mongo } from "mongoose";
import Account from "../models/Account.ts";

const identityField = "identities.google";
function duplicate(error: unknown) {
  return error instanceof mongo.MongoServerError && error.code === 11000;
}

export async function findOrCreateGoogleAccount(identity: {
  sub: string;
  email: string;
  name: string;
}) {
  await Account.init();
  const filter = { [identityField]: identity.sub };
  const linked = await Account.findOne(filter);
  if (linked) return linked;
  try {
    return await Account.create({
      email: identity.email,
      name: identity.name,
      identities: { google: identity.sub },
    });
  } catch (error) {
    if (!duplicate(error)) throw error;
    // A concurrent first sign-in may have created this same identity.
    return Account.findOne(filter);
  }
}

export async function connectGoogleAccount(
  accountId: Types.ObjectId,
  subject: string,
) {
  await Account.init();
  try {
    return Boolean(
      (await Account.exists({
        _id: accountId,
        isActive: { $ne: false },
        [identityField]: subject,
      })) ||
      (await Account.findOneAndUpdate(
        {
          _id: accountId,
          isActive: { $ne: false },
          [identityField]: { $exists: false },
        },
        { $set: { [identityField]: subject } },
      ).select("_id")),
    );
  } catch (error) {
    if (duplicate(error)) return false;
    throw error;
  }
}
