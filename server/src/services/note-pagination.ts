import { isObjectIdOrHexString } from "mongoose";

export const notePageSize = 50;

export function parseNoteCursor(value: unknown) {
  if (typeof value !== "string" || value.length > 50) return null;
  const [date, id, extra] = value.split("~");
  if (extra !== undefined || !isObjectIdOrHexString(id)) return null;
  if (!date) return { timestamp: null, id };
  const timestamp = new Date(date);
  if (
    !Number.isFinite(timestamp.getTime()) ||
    timestamp.toISOString() !== date
  ) {
    return null;
  }
  return { timestamp, id };
}

export async function readNotePage<T>(
  boundary: ReturnType<typeof parseNoteCursor> | undefined,
  read: (
    limit: number,
    timestamp?: Date | null | { $lt: Date },
    idBefore?: string,
  ) => PromiseLike<T[]>,
) {
  const limit = notePageSize + 1;
  const notes = await read(limit, boundary?.timestamp, boundary?.id);
  if (boundary?.timestamp && notes.length < limit) {
    // Separate ranges let the index seek past large groups of tied timestamps.
    notes.push(
      ...(await read(limit - notes.length, { $lt: boundary.timestamp })),
    );
    if (notes.length < limit) {
      notes.push(...(await read(limit - notes.length, null)));
    }
  }
  const hasMore = notes.length > notePageSize;
  if (hasMore) notes.pop();
  return { notes, hasMore };
}

export function formatNoteCursor(timestamp: Date | undefined, id: string) {
  return `${timestamp?.toISOString() ?? ""}~${id}`;
}
