import { mongo } from "mongoose";

const scopedKeys = { userId: 1, name: 1 } as const;
const legacyName = "name_1";

function hasKeys(
  index: mongo.IndexDescriptionInfo,
  keys: Record<string, number>,
) {
  const actual = Object.entries(index.key);
  const expected = Object.entries(keys);
  return (
    actual.length === expected.length &&
    expected.every(
      ([key, direction], position) =>
        actual[position]?.[0] === key && actual[position]?.[1] === direction,
    )
  );
}

function isFullUnique(index: mongo.IndexDescriptionInfo) {
  return (
    index.unique === true && !index.sparse && !index.partialFilterExpression
  );
}

async function listIndexes(tags: mongo.Collection) {
  try {
    return await tags.indexes();
  } catch (error) {
    if (error instanceof mongo.MongoServerError && error.code === 26) return [];
    throw error;
  }
}

export async function migrateAccountScopedTagIndex(tags: mongo.Collection) {
  const isScoped = (index: mongo.IndexDescriptionInfo) =>
    hasKeys(index, scopedKeys) &&
    isFullUnique(index) &&
    !index.collation &&
    !Object.hasOwn(index, "buildUUID");

  const existing = (await listIndexes(tags)).find(isScoped);
  // createIndex is a no-op for an equivalent index and awaits a pending build.
  await tags.createIndex(scopedKeys, {
    unique: true,
    ...(existing ? { name: existing.name } : {}),
  });

  const indexes = await listIndexes(tags);
  if (!indexes.some(isScoped)) {
    throw new Error("Account-scoped unique tag index could not be verified.");
  }

  const legacy = indexes.find((index) => index.name === legacyName);
  const unexpected = indexes.some(
    (index) =>
      index.name !== legacyName &&
      index.unique === true &&
      (hasKeys(index, { name: 1 }) || hasKeys(index, { name: -1 })),
  );
  if (
    unexpected ||
    (legacy?.unique &&
      (!hasKeys(legacy, { name: 1 }) ||
        !isFullUnique(legacy) ||
        legacy.collation))
  ) {
    throw new Error(
      "Found an unexpected name-only unique index or legacy tag index definition.",
    );
  }
  if (!legacy?.unique) return "already migrated";

  try {
    await tags.dropIndex(legacyName);
    return "removed legacy tag index";
  } catch (error) {
    if (error instanceof mongo.MongoServerError && error.code === 27) {
      return "already migrated";
    }
    throw error;
  }
}
