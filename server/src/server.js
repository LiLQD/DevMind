import dotenv from "dotenv";
import app from "./app.js";
import mongoose from "mongoose";
import crypto from "crypto";

// Make crypto globally available
global.crypto = crypto;

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
