import { webcrypto } from "node:crypto";

// Ensure the WebCrypto API is globally available before mongoose/mongodb
// attempt to use it (e.g. during SCRAM-SHA-256 auth handshake).
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

import dotenv from "dotenv";
import app from "./app.js";
import mongoose from "mongoose";

dotenv.config();

const PORT = process.env.PORT || 8080;

console.log("Starting DevMind server...");
console.log("PORT:", PORT);

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Backend chạy tại http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  });
