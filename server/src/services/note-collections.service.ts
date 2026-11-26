import { isObjectIdOrHexString, Types } from "mongoose";
import type { PopulateOptions } from "mongoose";
import Collection from "../models/Collection.ts";

// Older records may contain an unverified singular collection value.
export const noteResponseProjection = "-collection";

export const invalidNoteCollections = {
  message: "Invalid note collection references.",
};

// Undefined preserves an omitted field. Null signals an invalid reference.
export async function resolveNoteCollections(
  body: { collections?: unknown; collection?: unknown },
  userId: Types.ObjectId,
): Promise<Types.ObjectId[] | undefined | null> {
  if (Object.hasOwn(body, "collection")) return null;
  const { collections } = body;
  if (collections === undefined) return undefined;
  if (!Array.isArray(collections)) return null;

  const ids: Types.ObjectId[] = [];
  for (const value of collections) {
    if (typeof value !== "string" || !isObjectIdOrHexString(value)) return null;
    ids.push(new Types.ObjectId(value));
  }
  if (ids.length === 0) return ids;

  const uniqueIds = [...new Set(ids.map((id) => id.toHexString()))];
  const ownedCount = await Collection.countDocuments({
    userId,
    _id: { $in: uniqueIds },
  });
  return ownedCount === uniqueIds.length ? ids : null;
}

export function noteMetadataPopulation(
  userId: Types.ObjectId,
): PopulateOptions[] {
  return [
    { path: "tags", match: { userId } },
    { path: "collections", match: { userId } },
  ];
}
