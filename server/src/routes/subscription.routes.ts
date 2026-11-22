import express from "express";
import { protect } from "../middleware/auth.middleware.ts";
import { getAccountSubscription } from "../services/subscription.service.ts";
import { getMonthlyUsage } from "../services/usage.service.ts";

const router = express.Router();

router.get("/", protect, async (req, res) => {
  const accountId = req.user!.id;
  const [subscription, usage] = await Promise.all([
    getAccountSubscription(accountId),
    getMonthlyUsage(accountId),
  ]);
  res.set("Cache-Control", "no-store").json({ ...subscription, usage });
});

export default router;
