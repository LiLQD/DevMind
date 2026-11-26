import mongoose from "mongoose";
import { migrateAccountScopedTagIndex } from "../src/migrations/account-scoped-tag-index.ts";

const uri = process.env.TAG_INDEX_MIGRATION_MONGODB_URI;
if (!uri) {
  console.error(
    "Set TAG_INDEX_MIGRATION_MONGODB_URI explicitly to the intended database.",
  );
  process.exit(1);
}

const connection = mongoose.createConnection(uri, {
  autoCreate: false,
  autoIndex: false,
  serverSelectionTimeoutMS: 5000,
});
try {
  await connection.asPromise();
  const result = await migrateAccountScopedTagIndex(
    connection.db.collection("tags"),
  );
  console.log(`Tag index migration: ${result}.`);
} catch (error) {
  const code =
    error instanceof mongoose.mongo.MongoServerError
      ? ` (MongoDB code ${error.code})`
      : "";
  console.error(
    `Tag index migration failed${code}. Inspect indexes and verify the target database before retrying.`,
  );
  process.exitCode = 1;
} finally {
  await connection.close();
}
