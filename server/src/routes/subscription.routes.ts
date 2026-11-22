import express from "express";
import { protect } from "../middleware/auth.middleware.ts";
import { getAccountSubscription } from "../services/subscription.service.ts";

const router = express.Router();

router.get("/", protect, async (req, res) => {
  const subscription = await getAccountSubscription(req.user!.id);
  res.set("Cache-Control", "no-store").json(subscription);
});

export default router;
