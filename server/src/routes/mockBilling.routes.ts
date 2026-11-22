import express from "express";
import { protect } from "../middleware/auth.middleware.ts";
import {
  applyMockBillingAction,
  getMockCheckout,
  isMockBillingAction,
  startMockCheckout,
} from "../services/mockBilling.service.ts";

const router = express.Router();
router.use(protect);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidRequest() {
  return Object.assign(new Error("Invalid mock billing request."), {
    status: 400,
    code: "INVALID_MOCK_BILLING_REQUEST",
  });
}

router.post("/checkouts", async (req, res) => {
  const body: unknown = req.body;
  if (
    body !== undefined &&
    (!isObject(body) || Object.keys(body).length !== 0)
  ) {
    throw invalidRequest();
  }
  res
    .set("Cache-Control", "no-store")
    .json(await startMockCheckout(req.user!.id));
});

router.get("/checkouts/:id", async (req, res) => {
  res
    .set("Cache-Control", "no-store")
    .json(await getMockCheckout(req.user!.id, req.params.id));
});

router.post("/checkouts/:id/actions", async (req, res) => {
  const body: unknown = req.body;
  if (
    !isObject(body) ||
    Object.keys(body).length !== 2 ||
    !isMockBillingAction(body.action) ||
    typeof body.expectedRevision !== "number" ||
    !Number.isSafeInteger(body.expectedRevision) ||
    body.expectedRevision < 0 ||
    body.expectedRevision >= Number.MAX_SAFE_INTEGER
  ) {
    throw invalidRequest();
  }
  res
    .set("Cache-Control", "no-store")
    .json(
      await applyMockBillingAction(
        req.user!.id,
        req.params.id,
        body.action,
        body.expectedRevision,
      ),
    );
});

export default router;
